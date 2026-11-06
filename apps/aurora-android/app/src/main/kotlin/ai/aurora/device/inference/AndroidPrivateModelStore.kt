package ai.aurora.device.inference

import android.content.Context
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.Process
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.FileDescriptor
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** No importer, mkdir, external storage, URI, download, Termux access or path argument is exposed. */
internal class AndroidPrivateModelStore(private val context: Context) : NativeModelStore {
    // Retain uncertain ownership without retrying close: a descriptor number could have been reused.
    private class UncertainOpen(val raw: FileDescriptor, val duplicate: ParcelFileDescriptor?)
    private val uncertainOpen = AtomicReference<UncertainOpen?>(null)
    private val uncertainHandle = AtomicReference<NativeModelHandle?>(null)

    override fun openPinned(): NativeModelHandle {
        if (uncertainOpen.get() != null || uncertainHandle.get() != null) throw NativeModelOwnershipUncertain()
        // Nanosecond stat identity and O_CLOEXEC are public from API 27. Keep the app's minSdk 26,
        // but fail closed for this inactive preparation component there, rather than weaken checks.
        if (Build.VERSION.SDK_INT < 27) throw IOException("NATIVE_MODEL_API_UNAVAILABLE")
        val root = context.noBackupFilesDir.canonicalFile
        val rootStat = Os.lstat(root.path)
        if (!OsConstants.S_ISDIR(rootStat.st_mode) || rootStat.st_uid != Process.myUid()) {
            throw IOException("NATIVE_MODEL_STORAGE_UNAVAILABLE")
        }
        val directory = File(root, NativePinnedModel.DIRECTORY)
        val directoryStat = Os.lstat(directory.path)
        if (
            !OsConstants.S_ISDIR(directoryStat.st_mode) || directoryStat.st_uid != Process.myUid() ||
                (directoryStat.st_mode and (OsConstants.S_IWGRP or OsConstants.S_IWOTH)) != 0 ||
                directory.canonicalFile.parentFile != root
        ) {
            throw IOException("NATIVE_MODEL_STORAGE_UNAVAILABLE")
        }
        val file = File(directory, NativePinnedModel.FILE_NAME)
        val raw = Os.open(file.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_CLOEXEC, 0)
        var duplicate: ParcelFileDescriptor? = null
        try {
            duplicate = ParcelFileDescriptor.dup(raw)
        } finally {
            try {
                Os.close(raw)
            } catch (_: Exception) {
                var retainedDuplicate: ParcelFileDescriptor? = null
                try { duplicate?.close() } catch (_: Exception) { retainedDuplicate = duplicate }
                uncertainOpen.set(UncertainOpen(raw, retainedDuplicate))
                throw NativeModelOwnershipUncertain()
            }
        }
        val handle = AndroidNativeModelHandle(checkNotNull(duplicate))
        try {
            val stamp = handle.stamp()
            if (!stamp.regularFile || !stamp.readOnlyDescriptor || !stamp.ownedByApp) {
                throw IOException("NATIVE_MODEL_FILE_UNAVAILABLE")
            }
            return handle
        } catch (_: Exception) {
            try {
                handle.close()
            } catch (_: Exception) {
                uncertainHandle.set(handle)
                throw NativeModelOwnershipUncertain()
            }
            throw IOException("NATIVE_MODEL_FILE_UNAVAILABLE")
        }
    }
}

/** The original descriptor remains owned by the runtime until native teardown is acknowledged. */
private class AndroidNativeModelHandle(private val original: ParcelFileDescriptor) : NativeModelHandle {
    private val closed = AtomicBoolean(false)
    private val ownershipUncertain = AtomicBoolean(false)
    private val uncertainHashDuplicate = AtomicReference<ParcelFileDescriptor?>(null)

    override val descriptor: Int
        get() {
            check(!closed.get())
            return original.fd
        }

    override fun stamp(): NativeModelStamp {
        check(!closed.get())
        if (Build.VERSION.SDK_INT < 27) throw IOException("NATIVE_MODEL_API_UNAVAILABLE")
        val descriptor = original.fileDescriptor
        val stat = Os.fstat(descriptor)
        val flags = Os.fcntlInt(descriptor, OsConstants.F_GETFL, 0)
        return NativeModelStamp(
            device = stat.st_dev,
            inode = stat.st_ino,
            lengthBytes = stat.st_size,
            modifiedSeconds = stat.st_mtim.tv_sec,
            modifiedNanos = stat.st_mtim.tv_nsec,
            changedSeconds = stat.st_ctim.tv_sec,
            changedNanos = stat.st_ctim.tv_nsec,
            regularFile = OsConstants.S_ISREG(stat.st_mode),
            readOnlyDescriptor = (flags and OsConstants.O_ACCMODE) == OsConstants.O_RDONLY,
            ownedByApp = stat.st_uid == Process.myUid(),
        )
    }

    override fun openHashStream(): InputStream {
        check(!closed.get())
        if (ownershipUncertain.get()) throw NativeModelOwnershipUncertain()
        val duplicate = ParcelFileDescriptor.dup(original.fileDescriptor)
        return try {
            Os.lseek(duplicate.fileDescriptor, 0L, OsConstants.SEEK_SET)
            object : FilterInputStream(ParcelFileDescriptor.AutoCloseInputStream(duplicate)) {
                private val closeAttempted = AtomicBoolean(false)
                override fun close() {
                    if (!closeAttempted.compareAndSet(false, true)) return
                    try {
                        super.close()
                    } catch (_: Exception) {
                        uncertainHashDuplicate.compareAndSet(null, duplicate)
                        ownershipUncertain.set(true)
                        throw NativeModelOwnershipUncertain()
                    }
                }
            }
        } catch (_: Exception) {
            try {
                duplicate.close()
            } catch (_: Exception) {
                uncertainHashDuplicate.compareAndSet(null, duplicate)
                ownershipUncertain.set(true)
                throw NativeModelOwnershipUncertain()
            }
            throw IOException("NATIVE_MODEL_READ_UNAVAILABLE")
        }
    }

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            try {
                original.close()
            } catch (_: Exception) {
                ownershipUncertain.set(true)
                throw NativeModelOwnershipUncertain()
            }
        }
        // Original close succeeding cannot repair an unacknowledged close of the hashing duplicate.
        if (ownershipUncertain.get()) throw NativeModelOwnershipUncertain()
    }
}
