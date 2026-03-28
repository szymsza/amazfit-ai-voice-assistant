import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { px } from '@zos/utils'

export const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo()

/** Full-screen canvas — colored background + click target */
export const CANVAS_STYLE = {
  x: 0,
  y: 0,
  w: DEVICE_WIDTH,
  h: DEVICE_HEIGHT,
}

/** State label centered on screen */
export const STATE_TEXT_STYLE = {
  x: px(40),
  y: DEVICE_HEIGHT / 2 - px(30),
  w: DEVICE_WIDTH - px(80),
  h: px(60),
  color: 0xffffff,
  text_size: px(30),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.NONE,
  text: 'Tap to record',
}
