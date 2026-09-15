package ai.aurora.device.media

import android.service.notification.NotificationListenerService

/**
 * System-bound anchor used only to qualify Aurora for Notification Listener / active MediaSession
 * access. It does not inspect or persist notification content and cannot grant Aurora authority.
 */
class AuroraMediaSessionListenerService : NotificationListenerService()
