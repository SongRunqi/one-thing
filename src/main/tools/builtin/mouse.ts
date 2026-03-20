/**
 * Built-in Tool: Mouse
 *
 * Control the mouse cursor - move, click, drag, scroll.
 * Requires Accessibility permission on macOS.
 */

import { z } from 'zod'
import { screen } from 'electron'
import { Tool } from '../core/tool.js'
import {
  checkAccessibilityPermission,
  getAccessibilityPermissionError,
} from '../../utils/accessibility.js'

// Import nut.js modules
import { mouse, Point, Button, straightTo, centerOf, Region } from '@nut-tree-fork/nut-js'

/**
 * Mouse Tool Metadata
 */
export interface MouseMetadata {
  action: string
  x?: number
  y?: number
  button?: string
  scrollAmount?: number
  success: boolean
  [key: string]: unknown
}

/**
 * Mouse Tool Parameters Schema
 */
const MouseParameters = z.object({
  action: z
    .enum(['move', 'click', 'double_click', 'right_click', 'middle_click', 'drag', 'scroll'])
    .describe(
      'The mouse action to perform: move (move cursor), click (left click), ' +
        'double_click, right_click, middle_click, drag (drag to position), scroll (scroll wheel)'
    ),

  x: z
    .number()
    .optional()
    .describe('X coordinate on screen. Required for move, click, drag actions.'),

  y: z
    .number()
    .optional()
    .describe('Y coordinate on screen. Required for move, click, drag actions.'),

  button: z
    .enum(['left', 'right', 'middle'])
    .optional()
    .default('left')
    .describe('Mouse button for click action. Defaults to left.'),

  scrollAmount: z
    .number()
    .optional()
    .describe('Scroll amount in pixels. Positive = scroll down, negative = scroll up. Required for scroll action.'),

  scrollDirection: z
    .enum(['vertical', 'horizontal'])
    .optional()
    .default('vertical')
    .describe('Scroll direction. Defaults to vertical.'),

  smooth: z
    .boolean()
    .optional()
    .default(false)
    .describe('Use smooth/animated movement for move and drag actions.'),
})

/**
 * Convert button string to nut.js Button enum
 */
function getButton(button?: string): Button {
  switch (button) {
    case 'right':
      return Button.RIGHT
    case 'middle':
      return Button.MIDDLE
    default:
      return Button.LEFT
  }
}

/**
 * Validate coordinates are within screen bounds
 */
function validateCoordinates(x: number, y: number): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  if (x < 0 || x > width || y < 0 || y > height) {
    throw new Error(
      `Coordinates (${x}, ${y}) are outside screen bounds (0,0) to (${width}, ${height})`
    )
  }
}

/**
 * Mouse Tool Definition
 */
export const MouseTool = Tool.define<typeof MouseParameters, MouseMetadata>('mouse', {
  name: 'Mouse',
  description: `Control the mouse cursor to interact with the desktop.

Actions:
- move: Move cursor to (x, y) coordinates
- click: Left click at (x, y) or current position
- double_click: Double left click
- right_click: Right click
- middle_click: Middle click
- drag: Drag from current position to (x, y)
- scroll: Scroll wheel (positive = down, negative = up)

Note: Requires Accessibility permission on macOS. Coordinates are in screen pixels with (0,0) at top-left.`,
  category: 'builtin',
  enabled: true,
  autoExecute: false, // Requires user confirmation for safety

  parameters: MouseParameters,

  async execute(args, ctx) {
    const { action, x, y, button, scrollAmount, scrollDirection, smooth } = args

    // Check accessibility permission on macOS
    if (!checkAccessibilityPermission(false)) {
      throw new Error(getAccessibilityPermissionError())
    }

    // Update metadata with initial state
    ctx.metadata({
      title: `Mouse: ${action}`,
      metadata: {
        action,
        x,
        y,
        button,
        scrollAmount,
        success: false,
      },
    })

    // Configure nut.js mouse speed
    if (smooth) {
      mouse.config.mouseSpeed = 1000 // pixels per second for smooth movement
    } else {
      mouse.config.mouseSpeed = 5000 // fast movement
    }

    let resultMessage = ''

    try {
      switch (action) {
        case 'move': {
          if (x === undefined || y === undefined) {
            throw new Error('x and y coordinates are required for move action')
          }
          validateCoordinates(x, y)

          const targetPoint = new Point(x, y)
          if (smooth) {
            await mouse.move(straightTo(targetPoint))
          } else {
            await mouse.setPosition(targetPoint)
          }
          resultMessage = `Moved mouse to (${x}, ${y})`
          break
        }

        case 'click': {
          if (x !== undefined && y !== undefined) {
            validateCoordinates(x, y)
            await mouse.setPosition(new Point(x, y))
          }
          await mouse.click(getButton(button))
          const pos = await mouse.getPosition()
          resultMessage = `Clicked ${button || 'left'} button at (${pos.x}, ${pos.y})`
          break
        }

        case 'double_click': {
          if (x !== undefined && y !== undefined) {
            validateCoordinates(x, y)
            await mouse.setPosition(new Point(x, y))
          }
          await mouse.doubleClick(getButton(button))
          const pos = await mouse.getPosition()
          resultMessage = `Double-clicked at (${pos.x}, ${pos.y})`
          break
        }

        case 'right_click': {
          if (x !== undefined && y !== undefined) {
            validateCoordinates(x, y)
            await mouse.setPosition(new Point(x, y))
          }
          await mouse.click(Button.RIGHT)
          const pos = await mouse.getPosition()
          resultMessage = `Right-clicked at (${pos.x}, ${pos.y})`
          break
        }

        case 'middle_click': {
          if (x !== undefined && y !== undefined) {
            validateCoordinates(x, y)
            await mouse.setPosition(new Point(x, y))
          }
          await mouse.click(Button.MIDDLE)
          const pos = await mouse.getPosition()
          resultMessage = `Middle-clicked at (${pos.x}, ${pos.y})`
          break
        }

        case 'drag': {
          if (x === undefined || y === undefined) {
            throw new Error('x and y coordinates are required for drag action')
          }
          validateCoordinates(x, y)

          const startPos = await mouse.getPosition()
          const targetPoint = new Point(x, y)

          await mouse.pressButton(getButton(button))
          if (smooth) {
            await mouse.move(straightTo(targetPoint))
          } else {
            await mouse.setPosition(targetPoint)
          }
          await mouse.releaseButton(getButton(button))

          resultMessage = `Dragged from (${startPos.x}, ${startPos.y}) to (${x}, ${y})`
          break
        }

        case 'scroll': {
          if (scrollAmount === undefined) {
            throw new Error('scrollAmount is required for scroll action')
          }

          if (x !== undefined && y !== undefined) {
            validateCoordinates(x, y)
            await mouse.setPosition(new Point(x, y))
          }

          if (scrollDirection === 'horizontal') {
            await mouse.scrollRight(scrollAmount)
          } else {
            if (scrollAmount > 0) {
              await mouse.scrollDown(scrollAmount)
            } else {
              await mouse.scrollUp(Math.abs(scrollAmount))
            }
          }

          const direction = scrollAmount > 0 ? 'down' : 'up'
          resultMessage = `Scrolled ${direction} by ${Math.abs(scrollAmount)} pixels`
          break
        }

        default:
          throw new Error(`Unknown action: ${action}`)
      }

      const metadata: MouseMetadata = {
        action,
        x,
        y,
        button,
        scrollAmount,
        success: true,
      }

      return {
        title: `Mouse ${action} completed`,
        output: resultMessage,
        metadata,
      }
    } catch (error: any) {
      const metadata: MouseMetadata = {
        action,
        x,
        y,
        button,
        scrollAmount,
        success: false,
      }

      return {
        title: `Mouse ${action} failed`,
        output: `Error: ${error.message}`,
        metadata,
      }
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid mouse parameters:\n${issues.join('\n')}`
  },
})
