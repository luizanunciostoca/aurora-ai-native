package ai.aurora.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.aurora.ui.model.AuroraPresenceMode
import ai.aurora.ui.model.AuroraSettings
import ai.aurora.ui.model.ProjectionFreshness
import ai.aurora.ui.model.ProjectionProvenance
import ai.aurora.ui.model.SemanticTone

internal val Night = Color(0xFF02060D)
internal val SurfaceDark = Color(0xFF071523)
internal val SurfaceRaised = Color(0xFF0B1D2F)
internal val AuroraCyan = Color(0xFF32E8FF)
internal val ElectricBlue = Color(0xFF358BFF)
internal val Ultraviolet = Color(0xFF835BFF)
internal val Verified = Color(0xFF46E6B4)
internal val Approval = Color(0xFFFFB547)
internal val Critical = Color(0xFFFF5D73)
internal val TextPrimary = Color(0xFFF4F8FF)
internal val TextSecondary = Color(0xFFA8B8C9)
internal val Outline = Color(0xFF18334C)

@Composable
internal fun AuroraTheme(settings: AuroraSettings, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = AuroraCyan,
            onPrimary = Night,
            secondary = ElectricBlue,
            onSecondary = TextPrimary,
            tertiary = Ultraviolet,
            background = Night,
            onBackground = TextPrimary,
            surface = SurfaceDark,
            onSurface = TextPrimary,
            surfaceVariant = SurfaceRaised,
            onSurfaceVariant = if (settings.highContrast) Color.White else TextSecondary,
            error = Critical,
            onError = Night,
            outline = if (settings.highContrast) Color(0xFF4E718E) else Outline,
        ),
        content = content,
    )
}

@Composable
internal fun AuroraBackdrop(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF0B1930), Night, Color(0xFF01040A)),
                    center = Offset(500f, 240f),
                    radius = 1_300f,
                ),
            ),
    ) {
        content()
    }
}

@Composable
internal fun AuroraCore(
    mode: AuroraPresenceMode,
    reducedMotion: Boolean,
    size: Dp,
) {
    val transition = rememberInfiniteTransition(label = "aurora-core")
    val animatedPulse by transition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(animation = tween(1_800), repeatMode = RepeatMode.Reverse),
        label = "aurora-pulse",
    )
    val pulse = if (reducedMotion) 1f else animatedPulse
    val color = presenceColor(mode)
    Box(
        modifier = Modifier
            .size(size)
            .semantics { contentDescription = "Aurora ${mode.name.lowercase().replace('_', ' ')}" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = this.size.minDimension / 2f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(color.copy(alpha = 0.36f), color.copy(alpha = 0.05f), Color.Transparent),
                    radius = radius,
                ),
                radius = radius * pulse,
            )
            drawCircle(color = color.copy(alpha = 0.30f), radius = radius * 0.58f * pulse)
            drawCircle(color = SurfaceRaised, radius = radius * 0.43f)
            drawCircle(color = color.copy(alpha = 0.82f), radius = radius * 0.22f)
            drawCircle(color = Color.White.copy(alpha = 0.78f), radius = radius * 0.075f)
        }
    }
}

@Composable
internal fun SmallBadge(text: String, tone: SemanticTone) {
    val color = toneColor(tone)
    Text(
        text = text,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = 0.30f), RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 5.dp),
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.7.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
internal fun Heading(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(title, fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
        Text(body, color = TextSecondary, fontSize = 14.sp, lineHeight = 21.sp)
    }
}

@Composable
internal fun KeyValue(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, color = TextSecondary, fontSize = 12.sp)
        Text(
            value,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(max = 360.dp),
        )
    }
}

@Composable
internal fun LuminousCallout(title: String, body: String, tone: SemanticTone) {
    val color = toneColor(tone)
    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.08f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, color.copy(alpha = 0.36f)),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
            Text(body, fontSize = 13.sp, lineHeight = 19.sp)
        }
    }
}

@Composable
internal fun EmptyState(title: String, body: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            AuroraCore(AuroraPresenceMode.DORMANT, reducedMotion = true, size = 90.dp)
            Spacer(Modifier.height(16.dp))
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Text(
                body,
                color = TextSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp),
                lineHeight = 18.sp,
            )
        }
    }
}

@Composable
internal fun DegradedBanner(text: String, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Approval.copy(alpha = 0.11f))
            .padding(horizontal = 18.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            modifier = Modifier.weight(1f),
            color = TextPrimary,
            fontSize = 12.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        TextButton(onClick = onDismiss) { Text("Fechar") }
    }
}

internal fun toneColor(tone: SemanticTone): Color = when (tone) {
    SemanticTone.NEUTRAL -> TextSecondary
    SemanticTone.INFO -> AuroraCyan
    SemanticTone.EXECUTION -> ElectricBlue
    SemanticTone.REASONING -> Ultraviolet
    SemanticTone.VERIFIED -> Verified
    SemanticTone.APPROVAL -> Approval
    SemanticTone.CRITICAL -> Critical
}

internal fun provenanceTone(provenance: ProjectionProvenance): SemanticTone = when (provenance) {
    ProjectionProvenance.LIVE -> SemanticTone.VERIFIED
    ProjectionProvenance.CONNECTED_WHEN_AVAILABLE -> SemanticTone.INFO
    ProjectionProvenance.TARGET_PREVIEW -> SemanticTone.REASONING
}

internal fun freshnessTone(freshness: ProjectionFreshness): SemanticTone = when (freshness) {
    ProjectionFreshness.CURRENT -> SemanticTone.VERIFIED
    ProjectionFreshness.STALE -> SemanticTone.APPROVAL
    ProjectionFreshness.UNKNOWN -> SemanticTone.NEUTRAL
    ProjectionFreshness.CONFLICT -> SemanticTone.CRITICAL
}

internal fun presenceTone(mode: AuroraPresenceMode): SemanticTone = when (mode) {
    AuroraPresenceMode.DORMANT,
    AuroraPresenceMode.PRESENT,
    AuroraPresenceMode.AWAKEN,
    AuroraPresenceMode.LISTENING,
    -> SemanticTone.INFO
    AuroraPresenceMode.UNDERSTANDING,
    AuroraPresenceMode.RETRIEVING_CONTEXT,
    AuroraPresenceMode.REASONING,
    AuroraPresenceMode.COORDINATING,
    -> SemanticTone.REASONING
    AuroraPresenceMode.WAITING_APPROVAL -> SemanticTone.APPROVAL
    AuroraPresenceMode.EXECUTING -> SemanticTone.EXECUTION
    AuroraPresenceMode.VERIFYING -> SemanticTone.INFO
    AuroraPresenceMode.SUCCESS -> SemanticTone.VERIFIED
    AuroraPresenceMode.EXECUTION_UNCERTAIN,
    AuroraPresenceMode.DEGRADED,
    AuroraPresenceMode.OFFLINE,
    -> SemanticTone.CRITICAL
}

internal fun presenceColor(mode: AuroraPresenceMode): Color = toneColor(presenceTone(mode))

internal fun presenceHeadline(mode: AuroraPresenceMode): String = when (mode) {
    AuroraPresenceMode.DORMANT -> "Disponível"
    AuroraPresenceMode.PRESENT -> "Pronta"
    AuroraPresenceMode.AWAKEN -> "Estou aqui"
    AuroraPresenceMode.LISTENING -> "Ouvindo"
    AuroraPresenceMode.UNDERSTANDING -> "Entendendo"
    AuroraPresenceMode.RETRIEVING_CONTEXT -> "Buscando contexto"
    AuroraPresenceMode.REASONING -> "Analisando"
    AuroraPresenceMode.COORDINATING -> "Coordenando"
    AuroraPresenceMode.WAITING_APPROVAL -> "Aguardando decisão"
    AuroraPresenceMode.EXECUTING -> "Executando request governado"
    AuroraPresenceMode.VERIFYING -> "Verificando estado real"
    AuroraPresenceMode.SUCCESS -> "Concluído e verificado"
    AuroraPresenceMode.EXECUTION_UNCERTAIN -> "Execução incerta"
    AuroraPresenceMode.DEGRADED -> "Continuando com limitações"
    AuroraPresenceMode.OFFLINE -> "Offline"
}
