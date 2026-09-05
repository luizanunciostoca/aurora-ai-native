package ai.aurora.device.network

internal sealed interface JsonValue {
    data class ObjectValue(val fields: Map<String, JsonValue>) : JsonValue
    data class StringValue(val value: String) : JsonValue
    data class NumberValue(val raw: String) : JsonValue
    data class BooleanValue(val value: Boolean) : JsonValue
    data object NullValue : JsonValue
}

internal object StrictJson {
    private const val MAX_DEPTH = 16
    private const val MAX_FIELDS = 512

    fun parseObject(text: String): JsonValue.ObjectValue {
        require(text.length <= 128 * 1024) { "JSON body exceeds parser bound" }
        val parser = Parser(text)
        val value = parser.parseValue(0)
        parser.skipWhitespace()
        require(parser.isDone()) { "JSON contains trailing data" }
        return value as? JsonValue.ObjectValue ?: error("JSON root must be an object")
    }

    fun encodeObject(fields: Iterable<Pair<String, Any?>>): String =
        buildString { appendObject(this, fields) }

    fun encodeArray(values: Iterable<Any?>): String =
        buildString {
            append('[')
            var first = true
            for (value in values) {
                if (!first) append(',')
                first = false
                appendValue(this, value)
            }
            append(']')
        }

    private fun appendObject(builder: StringBuilder, fields: Iterable<Pair<String, Any?>>) {
        builder.append('{')
        val seen = mutableSetOf<String>()
        var first = true
        for ((key, value) in fields) {
            require(seen.add(key)) { "duplicate JSON key: $key" }
            if (!first) builder.append(',')
            first = false
            appendString(builder, key)
            builder.append(':')
            appendValue(builder, value)
        }
        builder.append('}')
    }

    @Suppress("UNCHECKED_CAST")
    private fun appendValue(builder: StringBuilder, value: Any?) {
        when (value) {
            null -> builder.append("null")
            is String -> appendString(builder, value)
            is Boolean -> builder.append(if (value) "true" else "false")
            is Int -> builder.append(value)
            is Long -> builder.append(value)
            is Iterable<*> -> {
                builder.append('[')
                var first = true
                for (item in value) {
                    if (!first) builder.append(',')
                    first = false
                    appendValue(builder, item)
                }
                builder.append(']')
            }
            is Map<*, *> -> {
                val fields = value.entries.map { entry ->
                    val key = entry.key as? String ?: error("JSON object key must be a string")
                    key to entry.value
                }
                appendObject(builder, fields)
            }
            else -> error("unsupported JSON value type: ${value::class.java.name}")
        }
    }

    private fun appendString(builder: StringBuilder, value: String) {
        builder.append('"')
        for (character in value) {
            when (character) {
                '"' -> builder.append("\\\"")
                '\\' -> builder.append("\\\\")
                '\b' -> builder.append("\\b")
                '\u000C' -> builder.append("\\f")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                else -> {
                    if (character.code < 0x20) {
                        builder.append("\\u")
                        builder.append(character.code.toString(16).padStart(4, '0'))
                    } else {
                        builder.append(character)
                    }
                }
            }
        }
        builder.append('"')
    }

    internal fun JsonValue.ObjectValue.string(name: String): String =
        (fields[name] as? JsonValue.StringValue)?.value ?: error("missing string field: $name")

    internal fun JsonValue.ObjectValue.optionalString(name: String): String? =
        when (val value = fields[name]) {
            null, JsonValue.NullValue -> null
            is JsonValue.StringValue -> value.value
            else -> error("field $name must be a string or null")
        }

    internal fun JsonValue.ObjectValue.long(name: String): Long {
        val raw = (fields[name] as? JsonValue.NumberValue)?.raw ?: error("missing integer field: $name")
        require(INTEGER.matches(raw)) { "field $name must be an integer" }
        return raw.toLongOrNull() ?: error("field $name integer is out of range")
    }

    internal fun JsonValue.ObjectValue.int(name: String): Int {
        val value = long(name)
        require(value in Int.MIN_VALUE..Int.MAX_VALUE) { "field $name integer is out of range" }
        return value.toInt()
    }

    internal fun JsonValue.ObjectValue.boolean(name: String): Boolean =
        (fields[name] as? JsonValue.BooleanValue)?.value ?: error("missing boolean field: $name")

    internal fun JsonValue.ObjectValue.obj(name: String): JsonValue.ObjectValue =
        fields[name] as? JsonValue.ObjectValue ?: error("missing object field: $name")

    private class Parser(private val source: String) {
        private var index = 0
        private var parsedFields = 0

        fun isDone(): Boolean = index == source.length

        fun skipWhitespace() {
            while (index < source.length && source[index] in WHITESPACE) index += 1
        }

        fun parseValue(depth: Int): JsonValue {
            require(depth <= MAX_DEPTH) { "JSON nesting exceeds parser bound" }
            skipWhitespace()
            require(index < source.length) { "unexpected end of JSON" }
            return when (source[index]) {
                '{' -> parseObject(depth + 1)
                '"' -> JsonValue.StringValue(parseString())
                't' -> {
                    expectLiteral("true")
                    JsonValue.BooleanValue(true)
                }
                'f' -> {
                    expectLiteral("false")
                    JsonValue.BooleanValue(false)
                }
                'n' -> {
                    expectLiteral("null")
                    JsonValue.NullValue
                }
                '-', in '0'..'9' -> JsonValue.NumberValue(parseNumber())
                else -> error("unsupported JSON token at offset $index")
            }
        }

        private fun parseObject(depth: Int): JsonValue.ObjectValue {
            expect('{')
            skipWhitespace()
            val fields = linkedMapOf<String, JsonValue>()
            if (peek('}')) {
                index += 1
                return JsonValue.ObjectValue(fields)
            }
            while (true) {
                skipWhitespace()
                require(peek('"')) { "JSON object key must be a string" }
                val key = parseString()
                require(fields[key] == null) { "duplicate JSON key: $key" }
                parsedFields += 1
                require(parsedFields <= MAX_FIELDS) { "JSON field count exceeds parser bound" }
                skipWhitespace()
                expect(':')
                fields[key] = parseValue(depth)
                skipWhitespace()
                when {
                    peek(',') -> index += 1
                    peek('}') -> {
                        index += 1
                        return JsonValue.ObjectValue(fields)
                    }
                    else -> error("JSON object separator is invalid")
                }
            }
        }

        private fun parseString(): String {
            expect('"')
            val builder = StringBuilder()
            while (index < source.length) {
                val character = source[index++]
                when (character) {
                    '"' -> return builder.toString()
                    '\\' -> {
                        require(index < source.length) { "unterminated JSON escape" }
                        when (val escaped = source[index++]) {
                            '"', '\\', '/' -> builder.append(escaped)
                            'b' -> builder.append('\b')
                            'f' -> builder.append('\u000C')
                            'n' -> builder.append('\n')
                            'r' -> builder.append('\r')
                            't' -> builder.append('\t')
                            'u' -> builder.append(parseUnicodeEscape())
                            else -> error("invalid JSON escape")
                        }
                    }
                    else -> {
                        require(character.code >= 0x20) { "control character in JSON string" }
                        builder.append(character)
                    }
                }
            }
            error("unterminated JSON string")
        }

        private fun parseUnicodeEscape(): Char {
            require(index + 4 <= source.length) { "truncated JSON unicode escape" }
            val hex = source.substring(index, index + 4)
            require(hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
                "invalid JSON unicode escape"
            }
            index += 4
            return hex.toInt(16).toChar()
        }

        private fun parseNumber(): String {
            val start = index
            if (peek('-')) index += 1
            require(index < source.length) { "truncated JSON number" }
            if (peek('0')) {
                index += 1
            } else {
                require(source[index] in '1'..'9') { "invalid JSON number" }
                while (index < source.length && source[index].isDigit()) index += 1
            }
            if (peek('.') || peek('e') || peek('E')) {
                error("fractional JSON numbers are not accepted by this protocol")
            }
            return source.substring(start, index)
        }

        private fun expectLiteral(value: String) {
            require(source.regionMatches(index, value, 0, value.length)) { "invalid JSON literal" }
            index += value.length
        }

        private fun expect(character: Char) {
            require(index < source.length && source[index] == character) {
                "expected '$character' at offset $index"
            }
            index += 1
        }

        private fun peek(character: Char): Boolean = index < source.length && source[index] == character
    }

    private val INTEGER = Regex("-?(0|[1-9][0-9]*)")
    private val WHITESPACE = setOf(' ', '\t', '\r', '\n')
}

internal fun JsonValue.ObjectValue.jsonString(name: String): String =
    (fields[name] as? JsonValue.StringValue)?.value ?: error("missing string field: $name")

internal fun JsonValue.ObjectValue.jsonOptionalString(name: String): String? =
    when (val value = fields[name]) {
        null, JsonValue.NullValue -> null
        is JsonValue.StringValue -> value.value
        else -> error("field $name must be a string or null")
    }

internal fun JsonValue.ObjectValue.jsonLong(name: String): Long {
    val raw = (fields[name] as? JsonValue.NumberValue)?.raw ?: error("missing integer field: $name")
    require(Regex("-?(0|[1-9][0-9]*)").matches(raw)) { "field $name must be an integer" }
    return raw.toLongOrNull() ?: error("field $name integer is out of range")
}

internal fun JsonValue.ObjectValue.jsonInt(name: String): Int {
    val value = jsonLong(name)
    require(value in Int.MIN_VALUE..Int.MAX_VALUE) { "field $name integer is out of range" }
    return value.toInt()
}

internal fun JsonValue.ObjectValue.jsonBoolean(name: String): Boolean =
    (fields[name] as? JsonValue.BooleanValue)?.value ?: error("missing boolean field: $name")

internal fun JsonValue.ObjectValue.jsonObject(name: String): JsonValue.ObjectValue =
    fields[name] as? JsonValue.ObjectValue ?: error("missing object field: $name")
