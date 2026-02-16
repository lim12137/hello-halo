/**
 * IPC Handlers for Skills
 */

import { ipcMain } from 'electron'
import { listSkills, clearSkillsCache, type SkillInfo } from '../services/skills.service'

/**
 * Register skills IPC handlers
 */
export function registerSkillsHandlers(): void {
  /**
   * List all available skills/commands
   */
  ipcMain.handle('skills:list', (_event, projectPath?: string) => {
    try {
      const skills = listSkills(projectPath)
      return { success: true, data: skills }
    } catch (error) {
      console.error('[IPC] skills:list error:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * Clear skills cache (force refresh)
   */
  ipcMain.handle('skills:refresh', (_event) => {
    try {
      clearSkillsCache()
      return { success: true }
    } catch (error) {
      console.error('[IPC] skills:refresh error:', error)
      return { success: false, error: String(error) }
    }
  })

  console.log('[IPC] Skills handlers registered')
}

// Re-export types for use in preload/renderer
export type { SkillInfo }
