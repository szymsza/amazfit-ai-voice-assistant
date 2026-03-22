import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { px } from '@zos/utils'

export const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo()

const CX = DEVICE_WIDTH / 2
const CY = DEVICE_HEIGHT / 2

/** Background circle behind the record button */
export const RING_STYLE = {
  cx: CX,
  cy: CY + px(20),
  r: px(110),
  color: 0x333333,
}

/** The record button circle (changes color per state) */
export const BTN_STYLE = {
  cx: CX,
  cy: CY + px(20),
  r: px(90),
  color: 0xe63946,
}

/** Clickable area over the button */
export const CLICK_AREA_STYLE = {
  x: CX - px(110),
  y: CY + px(20) - px(110),
  w: px(220),
  h: px(220),
}

/** State label shown above the button */
export const STATE_TEXT_STYLE = {
  x: px(40),
  y: px(100),
  w: DEVICE_WIDTH - px(80),
  h: px(60),
  color: 0xffffff,
  text_size: px(30),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.NONE,
  text: 'Tap to record',
}
