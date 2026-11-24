import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

import { transformSync } from '@swc/core'

import { getChorePermissions } from '../src/utils/ChoreAccess.js'
import { visibleLabels } from '../src/utils/Labels.js'

const element = (type, props) => ({ type, props })
const components = new Proxy({}, { get: (_, name) => name })

function render(overrides = {}, options = {}) {
  const actions = []
  const selections = []
  const menus = []
  const filters = []
  const modules = {
    react: { memo: component => component },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    '@mui/joy': components,
    '@mui/icons-material': components,
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
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
  function load(file) {
    const source = readFileSync(
      new URL(
        `../src/views/Projects/projectLayout/${file}.jsx`,
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
    const exports = {}
    vm.runInNewContext(code, {
      exports,
      require: name => {
        assert.ok(modules[name], `Unexpected import: ${name}`)
        return modules[name]
      },
    })
    return exports.default
  }
  const Action = load('ProjectTaskAction')
  modules['./ProjectTaskAction'] = { default: Action, __esModule: true }
  const Card = load('ProjectBoardCard')
  const props = {
    chore: { id: 9, name: 'Wash the dishes', status: 0 },
    onAction: (action, chore) => actions.push([action, chore.id]),
    onSelectionToggle: () => selections.push(true),
    onOpenActionMenu: (anchor, chore) => menus.push([anchor, chore.id]),
    onChipClick: filter => filters.push(filter),
    ...overrides,
  }
  return {
    tree: Card(props),
    action: Action(props),
    actions,
    selections,
    menus,
    filters,
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
const event = { currentTarget: 'anchor', stopPropagation() {} }

test('one-tap actions retain completion, pause, resume and approval semantics', () => {
  for (const [status, action] of [
    [0, 'complete'],
    [1, 'pause'],
    [2, 'start'],
    [3, 'approve'],
  ]) {
    const card = render(
      { chore: { id: 9, name: 'Task', status, assignedTo: 5 } },
      { members: [{ userId: 5, role: 'admin' }] },
    )
    assert.equal(card.action.type, 'IconButton')
    assert.equal(card.action.props.disabled, false)
    assert.ok(card.action.props.sx.minHeight >= 44)
    card.action.props.onClick(event)
    assert.deepEqual(card.actions, [[action, 9]])
  }
  assert.equal(
    render(
      { chore: { id: 9, name: 'Task', status: 0, assignedTo: 5 } },
      { outsideWindow: true },
    ).action.props.disabled,
    true,
  )
})

test('approval mirrors the backend: only admins and managers may approve', () => {
  const props = { chore: { id: 9, name: 'Task', status: 3, createdBy: 5 } }
  // Without approval rights the action slot shows the passive status chip.
  assert.equal(render(props).action.type, 'ChoreStatusChip')
  assert.equal(
    render(props, { members: [{ userId: 5, role: 'member' }] }).action.type,
    'ChoreStatusChip',
  )
  const admin = render(props, { members: [{ userId: 5, role: 'admin' }] })
  assert.equal(admin.action.type, 'IconButton')
  assert.equal(admin.action.props.disabled, false)
  const impersonated = render(props, {
    impersonatedUser: { userId: 8 },
    members: [{ userId: 8, role: 'manager' }],
  })
  assert.equal(impersonated.action.type, 'IconButton')
  assert.equal(impersonated.action.props.disabled, false)
})

test('selection does not complete a task and hides secondary actions', () => {
  const card = render({ isMultiSelectMode: true, isSelected: true })
  assert.equal(card.action.type, 'Checkbox')
  assert.equal(card.action.props.checked, true)
  card.action.props.onChange()
  assert.deepEqual(card.selections, [true])
  assert.deepEqual(card.actions, [])
  assert.equal(
    find(card.tree, node => node.type === 'MenuTrigger'),
    undefined,
  )
})

test('title wraps long text and menus have a shared owner', () => {
  // The draggable board item owns focus and keyboard activation, so the
  // title itself is plain text rather than a nested interactive control.
  const card = render()
  const title = find(card.tree, node => node.props?.title === 'Wash the dishes')
  assert.equal(title.props.component, 'span')
  assert.equal(title.props.sx.overflowWrap, 'anywhere')
  find(card.tree, node => node.type === 'MenuTrigger').props.onClick(event)
  assert.deepEqual(card.menus, [['anchor', 9]])
})

test('metadata is secondary and queued actions stay visible', () => {
  const card = render({
    chore: {
      id: 9,
      name: 'Task',
      status: 0,
      nextDueDate: '2026-01-01',
      _pending: true,
    },
  })
  const due = find(card.tree, node => node.props?.component === 'time')
  assert.equal(due.props.dateTime, '2026-01-01')
  assert.equal(due.props.sx.color, 'danger.plainColor')
  assert.ok(find(card.tree, node => node.type === 'PendingBadge'))
  assert.equal(
    find(render().tree, node => node.props?.component === 'time'),
    undefined,
  )
  assert.ok(
    find(
      render({}, { pendingCommands: [{}] }).tree,
      node => node.type === 'PendingBadge',
    ),
  )
})
