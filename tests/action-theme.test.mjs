import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { URL } from 'node:url'

const source = path =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

// Completion keeps its familiar green on the default skin; custom skins use
// their accent instead of introducing an unrelated status color.
const COMPLETION_COLOR =
  /const completionColor = skin === 'default' \? 'success' : 'primary'/

test('task detail actions use the theme accent rather than success green', () => {
  const view = source('views/ChoreEdit/ChoreView.jsx')
  assert.doesNotMatch(view, /color='success'/)
  for (const handler of [
    'handleApproveChore',
    'handleTaskCompletion',
    'handleChoreStart',
  ]) {
    assert.ok(view.includes(handler))
  }
  assert.match(view, COMPLETION_COLOR)
  const split = source('views/ChoreEdit/TimerSplitButton.jsx')
  assert.match(split, COMPLETION_COLOR)
  assert.match(
    split,
    /color=\{chore.status === 1 \? 'warning' : completionColor\}/,
  )
  const passed = source('views/ChoreEdit/TimePassedCard.jsx')
  assert.match(passed, COMPLETION_COLOR)
  assert.match(
    passed,
    /color=\{completionColor\}[\s\S]*?handleAction\('resume'\)/,
  )
})

test('cards preserve default green completion actions and custom theme accents', () => {
  for (const file of ['ChoreCard', 'CompactChoreCard']) {
    const card = source(`views/Chores/${file}.jsx`)
    assert.match(card, /const \{ skin \} = useThemeSkin\(\)/)
    assert.match(card, COMPLETION_COLOR)
    assert.match(
      card,
      /color=\{chore.status === 0 \? completionColor : 'warning'\}/,
    )
    assert.match(
      card,
      /color=\{completionColor\}[\s\S]*?onAction\('approve', chore\)/,
    )
  }
  assert.match(
    source('views/Chores/ChoreCard.jsx'),
    /color='success'[\s\S]*?chore.points/,
  )
  const toolbar = source('views/Chores/components/MultiSelectToolbar.jsx')
  assert.match(toolbar, COMPLETION_COLOR)
  assert.match(toolbar, /color=\{completionColor\}\s+onClick=\{onComplete\}/)
  assert.match(
    source('views/Chores/ArchivedTasks.jsx'),
    /color='primary'\s+onClick=\{handleBulkRestore\}/,
  )
})

test('primary swipe actions use paired solid background and text tokens', () => {
  const swipe = source('views/Chores/components/ChoreSwipeActions.jsx')
  assert.equal(
    (
      swipe.match(/bgcolor='primary.solidBg'\s+color='primary.solidColor'/g) ||
      []
    ).length,
    4,
  )
  assert.doesNotMatch(swipe, /bgcolor='success.500'/)
  assert.match(swipe, /bgcolor='danger.600'/)
})

test('timer progress, timeline and live sessions follow the accent', () => {
  const timer = source('views/Timer/TimerDetails.jsx')
  assert.doesNotMatch(timer, /success\.|pulse-success/)
  // The only success color is the skin-gated completion color below.
  assert.equal((timer.match(/'success'/g) || []).length, 1)
  // A finished session reads as completed, using the skin-aware color.
  assert.match(timer, COMPLETION_COLOR)
  assert.match(
    timer,
    /running\s+\? 'primary'\s+: finished\s+\? completionColor\s+: 'warning'/,
  )
  for (const token of [
    'primary.softBg',
    'primary.solidBg',
    'primary.solidHoverBg',
    'primary.solidColor',
    'primary.plainColor',
  ]) {
    assert.ok(timer.includes(token), `missing themed timer token: ${token}`)
  }
})

test('resume timer button and its live indicator follow the accent', () => {
  const timer = source('views/Timer/TimerDetails.jsx')
  assert.match(timer, /const running = isTimerRunning\(\)/)
  assert.match(timer, /color=\{running \? 'warning' : 'primary'\}/)
  assert.match(timer, /const LiveDot = \(\{ color = 'primary' \}\)/)
  assert.match(timer, /bgcolor: `\$\{color\}.solidBg`/)
  assert.doesNotMatch(timer, /pulse-success|rgba\(76, 175, 80/)
})
