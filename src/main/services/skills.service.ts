/**
 * Skills Service - Scans and lists Claude Code skills
 *
 * Skills are stored in:
 * - User skills: ~/.claude/skills/<skill-name>/SKILL.md
 * - Project skills: <workspace>/.claude/skills/<skill-name>/SKILL.md
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Represents a single skill/command
 */
export interface SkillInfo {
  /** Skill name (used as /command) */
  name: string
  /** Skill description */
  description: string
  /** Source location */
  source: 'builtin' | 'user' | 'project'
  /** Whether user can invoke this skill */
  userInvocable: boolean
  /** Whether model can auto-invoke this skill */
  modelInvocation: boolean
}

/**
 * Fallback slash commands for Halo's embedded SDK mode.
 * Runtime commands from SDK (`system.init.slash_commands`) take precedence.
 */
const FALLBACK_BUILTIN_COMMANDS: SkillInfo[] = [
  { name: 'compact', description: 'Compact conversation with optional focus instructions', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'context', description: 'Visualize current context usage as a colored grid', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'cost', description: 'Show token usage statistics', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'init', description: 'Initialize project with CLAUDE.md guide', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'pr-comments', description: 'Generate pull request review comments', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'release-notes', description: 'Generate release notes from changes', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'review', description: 'Review code changes and surface issues', source: 'builtin', userInvocable: true, modelInvocation: true },
  { name: 'security-review', description: 'Perform a security-focused code review', source: 'builtin', userInvocable: true, modelInvocation: true },
]

const BUILTIN_COMMAND_DESCRIPTIONS = new Map(
  FALLBACK_BUILTIN_COMMANDS.map(cmd => [cmd.name, cmd.description] as const)
)

let runtimeBuiltinCommands: string[] | null = null

/**
 * Cache for scanned skills
 */
let skillsCache: SkillInfo[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5000 // 5 seconds cache

function normalizeCommandNames(commandNames: string[]): string[] {
  const unique = new Set<string>()
  for (const raw of commandNames) {
    const name = String(raw || '').trim()
    if (!name) continue
    unique.add(name)
  }
  return [...unique]
}

function arraysEqual(a: string[] | null, b: string[]): boolean {
  if (!a) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function buildBuiltinCommands(): SkillInfo[] {
  if (!runtimeBuiltinCommands || runtimeBuiltinCommands.length === 0) {
    return [...FALLBACK_BUILTIN_COMMANDS]
  }

  return runtimeBuiltinCommands.map(name => ({
    name,
    description: BUILTIN_COMMAND_DESCRIPTIONS.get(name) || 'Built-in slash command',
    source: 'builtin' as const,
    userInvocable: true,
    modelInvocation: true,
  }))
}

/**
 * Update runtime slash commands from SDK `system.init.slash_commands`.
 */
export function updateRuntimeBuiltinCommands(commandNames: string[]): void {
  const normalized = normalizeCommandNames(commandNames)
  if (normalized.length === 0 || arraysEqual(runtimeBuiltinCommands, normalized)) {
    return
  }

  runtimeBuiltinCommands = normalized
  clearSkillsCache()
  console.log(`[SkillsService] Runtime slash commands updated: ${normalized.join(', ')}`)
}

/**
 * Parse SKILL.md frontmatter
 */
function parseSkillFrontmatter(content: string): {
  name?: string
  description?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return {}
  }

  const frontmatter = frontmatterMatch[1]
  const result: Record<string, unknown> = {}

  // Parse YAML-like frontmatter
  const lines = frontmatter.split('\n')
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const key = match[1]
      let value: string | boolean = match[2].trim()
      // Handle boolean values
      if (value === 'true') value = true
      else if (value === 'false') value = false
      result[key] = value
    }
  }

  return result
}

/**
 * Scan a directory for skills
 */
function scanSkillsDirectory(skillsDir: string, source: 'user' | 'project'): SkillInfo[] {
  const skills: SkillInfo[] = []

  if (!fs.existsSync(skillsDir)) {
    return skills
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = path.join(skillsDir, entry.name)
      const skillMdPath = path.join(skillPath, 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) continue

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8')
        const frontmatter = parseSkillFrontmatter(content)

        // Use directory name as fallback for skill name
        const name = frontmatter.name || entry.name

        // Extract description from frontmatter or first paragraph
        let description = frontmatter.description || ''
        if (!description) {
          // Try to extract first paragraph after frontmatter
          const contentAfterFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
          const firstParagraph = contentAfterFrontmatter.split('\n\n')[0]
          if (firstParagraph) {
            description = firstParagraph.trim().slice(0, 100)
          }
        }

        skills.push({
          name,
          description,
          source,
          userInvocable: frontmatter.userInvocable !== false, // Default true
          modelInvocation: !frontmatter.disableModelInvocation, // Default true
        })
      } catch (err) {
        console.warn(`[SkillsService] Failed to parse skill: ${skillMdPath}`, err)
      }
    }
  } catch (err) {
    console.warn(`[SkillsService] Failed to scan directory: ${skillsDir}`, err)
  }

  return skills
}

/**
 * Get all available skills/commands
 * Merges builtin commands with user and project skills
 */
export function listSkills(projectPath?: string): SkillInfo[] {
  const now = Date.now()

  // Return cached result if still valid
  if (skillsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return skillsCache
  }

  const allSkills: SkillInfo[] = [...buildBuiltinCommands()]

  // Scan user skills from ~/.claude/skills/
  const userSkillsDir = path.join(app.getPath('home'), '.claude', 'skills')
  const userSkills = scanSkillsDirectory(userSkillsDir, 'user')
  allSkills.push(...userSkills)

  // Scan project skills from <project>/.claude/skills/
  if (projectPath) {
    const projectSkillsDir = path.join(projectPath, '.claude', 'skills')
    const projectSkills = scanSkillsDirectory(projectSkillsDir, 'project')

    // Project skills override user skills with same name
    for (const projectSkill of projectSkills) {
      const existingIndex = allSkills.findIndex(s => s.name === projectSkill.name)
      if (existingIndex >= 0) {
        allSkills[existingIndex] = projectSkill
      } else {
        allSkills.push(projectSkill)
      }
    }
  }

  // Sort alphabetically by name
  allSkills.sort((a, b) => a.name.localeCompare(b.name))

  // Update cache
  skillsCache = allSkills
  cacheTimestamp = now

  return allSkills
}

/**
 * Clear the skills cache (call when skills might have changed)
 */
export function clearSkillsCache(): void {
  skillsCache = null
  cacheTimestamp = 0
}
