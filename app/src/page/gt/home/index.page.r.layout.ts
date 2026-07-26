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
  text: 'Tap to ask a question',
  enable: false,
}

export const QUESTION_ANSWER_GAP = px(10)

/** Transcribed question text - shown during Playing/ReadingResponse states. Starts at vertical center (widest row of the round screen). */
export const QUESTION_TEXT_STYLE = {
  x: px(20),
  y: DEVICE_HEIGHT / 2,
  w: DEVICE_WIDTH - px(40),
  h: 165,
  color: 0xaaaaaa,
  text_size: px(20),
  align_h: hmUI.align.LEFT,
  align_v: hmUI.align.TOP,
  text_style: hmUI.text_style.WRAP,
  text: '',
  enable: false,
}

/** AI response text - shown during Playing/ReadingResponse states; extends off screen for scrollability. y is a static fallback; index.page.ts repositions it below the question's actual measured height. */
export const ANSWER_TEXT_STYLE = {
  x: px(20),
  y: QUESTION_TEXT_STYLE.y + QUESTION_TEXT_STYLE.h + QUESTION_ANSWER_GAP,
  w: DEVICE_WIDTH - px(40),
  h: 700,
  color: 0xffffff,
  text_size: px(22),
  align_h: hmUI.align.LEFT,
  align_v: hmUI.align.TOP,
  text_style: hmUI.text_style.WRAP,
  text: '',
  enable: false,
}
