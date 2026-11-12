package com.audiostudio.app

import com.audiostudio.app.updates.UpdateChecker
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerTest {
    @Test
    fun `stable release is newer than installed version`() {
        assertTrue(UpdateChecker.isNewerVersion("v0.2.0", "0.1.0"))
        assertFalse(UpdateChecker.isNewerVersion("v0.1.0", "0.1.0"))
        assertFalse(UpdateChecker.isNewerVersion("release-next", "0.1.0"))
    }

    @Test
    fun `stable release is newer than prerelease`() {
        assertTrue(UpdateChecker.isNewerVersion("1.0.0", "1.0.0-rc.2"))
        assertFalse(UpdateChecker.isNewerVersion("1.0.0-rc.2", "1.0.0-rc.10"))
    }
}
