import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import { transformSync } from '@swc/core'

import { getChorePermissions } from '../src/utils/ChoreAccess.js'
import { visibleLabels } from '../src/utils/Labels.js'

// Exercise the row's real render and handlers with lightweight hook/component
// stubs, without needing the application providers or a browser.
const source = readFileSync(
  new URL(
    '../src/views/Projects/projectLayout/ProjectTaskRow.jsx',
    import.meta.url,
  ),
  'utf8',
)
const { code } = transformSync(source, {
  jsc: {
    parser: { syntax: 'ecmascript', jsx: true },
    transform: { react: { runtime: 'automatic' } },
    target: 'es2022',
  },
  module: { type: 'commonjs' },
})
const element = (type, props) => ({ type, props })
const components = new Proxy({}, { get: (_, name) => name })

function render(overrides = {}, options = {}) {
  const actions = []
  const selections = []
  const navigations = []
  const menus = []
  const modules = {
    react: { memo: component => component },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    '@mui/joy': components,
    '@mui/icons-material': components,
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    'react-router-dom': { useNavigate: () => path => navigations.push(path) },
    '../../../contexts/ImpersonateUserContext': {
      useImpersonateUser: () => ({
        impersonatedUser: options.impersonatedUser,
      }),
    },
    '../../../contexts/LocalizationContext': {
      useLocalization: () => ({ timeFormat: 'HH:mm' }),
    },
    '../../../hooks/usePendingCommands': {
      usePendingCommands: () => ({ data: options.pendingCommands || [] }),
    },
    '../../../queries/UserQueries': {
      useUserProfile: () => ({ data: { id: 5 } }),
      useCircleMembers: () => ({ data: { res: options.members || [] } }),
    },
    '../../../utils/ChoreCardHelpers': {
      getDueDateChipColor: () => 'danger',
      getDueDateChipText: () => 'Yesterday',
      getRecurrentChipText: () => 'Daily',
    },
    '../../../utils/Chores': {
      notInCompletionWindow: () => options.outsideWindow,
    },
    '../../../utils/Colors': { getPriorityColor: () => '#d32f2f' },
    '../../../utils/ExternalLinks': {
      splitTextAtFirstLink: name => ({ before: name, after: '', link: null }),
      getFirstLink: () => null,
      openExternalLink: () => {},
    },
    '../../../utils/Labels': { visibleLabels },
    '../../../components/common/ExternalLinkChip': {
      LinkTypeIcon: 'LinkTypeIcon',
    },
    '../../../hooks/useChorePermissions': {
      useChorePermissions: chore =>
        getChorePermissions(
          chore,
          options.impersonatedUser?.userId || 5,
          options.members || [],
        ),
    },
    '../../components/ChoreStatusChip': {
      default: 'ChoreStatusChip',
      __esModule: true,
    },
    '../../components/ChoreActionMenu': {
      ChoreActionMenuTrigger: 'MenuTrigger',
    },
    '../../components/PendingBadge': {
      default: 'PendingBadge',
      __esModule: true,
    },
  }
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    require: name => {
      assert.ok(modules[name], `Unexpected import: ${name}`)
      return modules[name]
    },
  })
  const props = {
    chore: { id: 9, name: 'A very long task', status: 0, priority: 1 },
    performers: [],
    onAction: (action, chore) => actions.push([action, chore.id]),
    onSelectionToggle: () => selections.push(true),
    onOpenActionMenu: (anchor, chore) => menus.push([anchor, chore.id]),
    ...overrides,
  }
  return {
    tree: exports.default(props),
    actions,
    selections,
    navigations,
    menus,
  }
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, predicate)
    if (match) return match
  }
}
const control = row =>
  find(row.tree, node => node.type === 'Checkbox' || node.type === 'IconButton')

test('completion is an unchecked outlined checkbox with a priority tint', () => {
  const row = render()
  const checkbox = control(row)
  assert.equal(checkbox.type, 'Checkbox')
  assert.equal(checkbox.props.variant, 'outlined')
  assert.equal(checkbox.props.checked, false)
  assert.equal(
    checkbox.props.sx['& .MuiCheckbox-checkbox'].borderColor,
    '#d32f2f',
  )
  checkbox.props.onChange()
  assert.deepEqual(row.actions, [['complete', 9]])
  assert.equal(
    control(render({}, { outsideWindow: true })).props.disabled,
    true,
  )
})

test('multi-select uses the same slot without completing the task', () => {
  const row = render({ isMultiSelectMode: true, isSelected: true })
  const checkbox = control(row)
  assert.equal(checkbox.props.checked, true)
  checkbox.props.onChange()
  assert.deepEqual(row.selections, [true])
  assert.deepEqual(row.actions, [])
  assert.equal(
    find(row.tree, node => node.type === 'MenuTrigger'),
    undefined,
  )
})

test('start, pause and approval retain their existing task actions', () => {
  const admin = [{ userId: 5, role: 'admin' }]
  for (const [status, action] of [
    [1, 'pause'],
    [2, 'start'],
    [3, 'approve'],
  ]) {
    const row = render(
      { chore: { id: 9, name: 'Task', status, assignedTo: 5 } },
      { members: admin },
    )
    const button = control(row)
    assert.equal(button.props.disabled, false)
    button.props.onClick()
    assert.deepEqual(row.actions, [[action, 9]])
  }
})

test('approval mirrors the backend: only admins and managers may approve', () => {
  const pending = { chore: { id: 9, name: 'Task', status: 3, createdBy: 5 } }
  // Without approval rights the row shows a passive waiting indicator.
  const canApprove = row => {
    const button = control(row)
    if (!button) {
      assert.ok(find(row.tree, node => node.type === 'HourglassEmpty'))
      return false
    }
    return button.props.disabled === false
  }
  // Owning the task does not grant approval.
  assert.equal(canApprove(render(pending)), false)
  assert.equal(
    canApprove(render(pending, { members: [{ userId: 5, role: 'admin' }] })),
    true,
  )
  assert.equal(
    canApprove(render(pending, { members: [{ userId: 5, role: 'member' }] })),
    false,
  )
  // Impersonation evaluates the impersonated user's role, not the viewer's.
  assert.equal(
    canApprove(
      render(pending, {
        impersonatedUser: { userId: 8 },
        members: [{ userId: 8, role: 'manager' }],
      }),
    ),
    true,
  )
  assert.equal(
    canApprove(
      render(pending, {
        impersonatedUser: { userId: 8 },
        members: [{ userId: 5, role: 'admin' }],
      }),
    ),
    false,
  )
})

test('title supports keyboard navigation and menu uses the shared owner', () => {
  const row = render()
  const title = find(row.tree, node => node.props?.role === 'link')
  const event = { key: 'Enter', preventDefault() {}, stopPropagation() {} }
  title.props.onKeyDown(event)
  assert.deepEqual(row.navigations, ['/chores/9'])
  const selected = render({ isMultiSelectMode: true })
  find(selected.tree, node => node.props?.role === 'link').props.onKeyDown(
    event,
  )
  assert.deepEqual(selected.selections, [true])
  assert.deepEqual(selected.navigations, [])
  find(row.tree, node => node.type === 'MenuTrigger').props.onClick({
    currentTarget: 'anchor',
    stopPropagation() {},
  })
  assert.deepEqual(row.menus, [['anchor', 9]])
})

test('due date is plain text and offline changes keep their indicator', () => {
  const row = render({
    chore: {
      id: 9,
      name: 'Task',
      status: 0,
      nextDueDate: '2026-01-01',
      _pending: true,
    },
  })
  const due = find(row.tree, node => node.props?.component === 'time')
  assert.equal(due.props.children, 'Yesterday')
  assert.equal(due.props.dateTime, '2026-01-01')
  assert.equal(due.props.sx.color, 'danger.plainColor')
  assert.ok(find(row.tree, node => node.type === 'PendingBadge'))
})
