/**
 * Built-in Tool: Screenshot
 *
 * Capture screenshots of the screen, windows, or regions.
 * Uses nut.js screen module (requires Accessibility permission on macOS).
 */

import { z } from 'zod'
import { screen as electronScreen } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { Tool } from '../core/tool.js'
import { getScreenshotsDir, ensureDir } from '../../stores/paths.js'
import { v4 as uuidv4 } from 'uuid'
import {
  checkAccessibilityPermission,
  getAccessibilityPermissionError,
} from '../../utils/accessibility.js'

// Import nut.js screen module
import { screen, Region, imageResource } from '@nut-tree-fork/nut-js'

/**
 * Screenshot Tool Metadata
 */
export interface ScreenshotMetadata {
  mode: string
  path?: string
  width?: number
  height?: number
  windowTitle?: string
  success: boolean
  [key: string]: unknown
}

/**
 * Screenshot Tool Parameters Schema
 */
const ScreenshotParameters = z.object({
  mode: z
    .enum(['fullscreen', 'region'])
    .describe(
      'Screenshot capture mode: fullscreen (entire screen), ' +
        'region (rectangular area by coordinates)'
    ),

  x: z.number().optional().describe('Region X coordinate (top-left). Required for "region" mode.'),

  y: z.number().optional().describe('Region Y coordinate (top-left). Required for "region" mode.'),

  width: z.number().optional().describe('Region width in pixels. Required for "region" mode.'),

  height: z.number().optional().describe('Region height in pixels. Required for "region" mode.'),

  format: z
    .enum(['png', 'jpeg'])
    .optional()
    .default('png')
    .describe('Image output format. Defaults to png.'),
})

/**
 * Generate a unique filename for the screenshot
 */
function generateFilename(format: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const id = uuidv4().slice(0, 8)
  return `screenshot_${timestamp}_${id}.${format}`
}

/**
 * Screenshot Tool Definition
 */
export const ScreenshotTool = Tool.define<typeof ScreenshotParameters, ScreenshotMetadata>(
  'screenshot',
  {
    name: 'Screenshot',
    description: `Capture screenshots of the screen or specific regions.

Modes:
- fullscreen: Capture the entire primary screen
- region: Capture a rectangular region by coordinates

The screenshot is saved as an image file and returned for viewing.
Useful for seeing what's on screen before performing mouse/keyboard actions.

Note: Requires Accessibility permission on macOS.`,
    category: 'builtin',
    enabled: true,
    autoExecute: true, // Safe read-only operation

    parameters: ScreenshotParameters,

    async execute(args, ctx) {
      const { mode, x, y, width, height, format = 'png' } = args

      // Check accessibility permission on macOS
      if (!checkAccessibilityPermission(false)) {
        throw new Error(getAccessibilityPermissionError())
      }

      // Update metadata with initial state
      ctx.metadata({
        title: `Screenshot: ${mode}`,
        metadata: {
          mode,
          success: false,
        },
      })

      // Ensure screenshots directory exists
      const screenshotsDir = getScreenshotsDir()
      ensureDir(screenshotsDir)

      try {
        console.log(`[Screenshot] Starting ${mode} capture...`)

        let capturedImage
        let capturedWidth: number
        let capturedHeight: number

        switch (mode) {
          case 'fullscreen': {
            // Capture entire screen using nut.js
            capturedImage = await screen.grab()
            capturedWidth = await capturedImage.width
            capturedHeight = await capturedImage.height
            console.log(`[Screenshot] Captured fullscreen: ${capturedWidth}x${capturedHeight}`)
            break
          }

          case 'region': {
            if (x === undefined || y === undefined || width === undefined || height === undefined) {
              throw new Error('x, y, width, and height are required for region mode')
            }

            // Validate region bounds
            const screenSize = electronScreen.getPrimaryDisplay().size
            if (x < 0 || y < 0 || x + width > screenSize.width || y + height > screenSize.height) {
              throw new Error(
                `Region (${x}, ${y}, ${width}x${height}) exceeds screen bounds (${screenSize.width}x${screenSize.height})`
              )
            }

            // Capture specific region
            const region = new Region(x, y, width, height)
            capturedImage = await screen.grabRegion(region)
            capturedWidth = width
            capturedHeight = height
            console.log(`[Screenshot] Captured region: ${capturedWidth}x${capturedHeight}`)
            break
          }

          default:
            throw new Error(`Unknown mode: ${mode}`)
        }

        // Save the screenshot
        const filename = generateFilename(format)
        const screenshotPath = path.join(screenshotsDir, filename)

        // nut.js Image has toRGB method, we need to convert to PNG
        // Use the image's data directly
        const imageData = await capturedImage.toRGB()
        const sharp = (await import('sharp')).default

        // Create PNG from raw RGB data
        const pngBuffer = await sharp(Buffer.from(imageData.data), {
          raw: {
            width: capturedWidth,
            height: capturedHeight,
            channels: 4, // RGBA
          },
        })
          .png()
          .toBuffer()

        await fs.writeFile(screenshotPath, pngBuffer)
        console.log(`[Screenshot] Saved to: ${screenshotPath} (${pngBuffer.length} bytes)`)

        const metadata: ScreenshotMetadata = {
          mode,
          path: screenshotPath,
          width: capturedWidth,
          height: capturedHeight,
          success: true,
        }

        return {
          title: `Screenshot captured (${capturedWidth}x${capturedHeight})`,
          output: `Screenshot saved to: ${screenshotPath}\nSize: ${capturedWidth}x${capturedHeight} pixels`,
          metadata,
          attachments: [
            {
              type: 'image',
              path: screenshotPath,
            },
          ],
        }
      } catch (error: any) {
        console.error('[Screenshot] Error:', error)

        const errorMessage =
          error?.message || error?.toString() || String(error) || 'Unknown error'
        const metadata: ScreenshotMetadata = {
          mode,
          success: false,
        }

        return {
          title: `Screenshot failed`,
          output: `Error: ${errorMessage}`,
          metadata,
        }
      }
    },

    formatValidationError(error) {
      const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      return `Invalid screenshot parameters:\n${issues.join('\n')}`
    },
  }
)
