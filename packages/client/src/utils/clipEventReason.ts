type IconDefinition = [string, string]

interface ReasonPresentation {
  label: string
  icon: IconDefinition
}

const EXACT_REASONS: Record<string, ReasonPresentation> = {
  user_interaction_dashcam_icon_tapped: {
    label: 'Manual',
    icon: ['fas', 'camera'],
  },
  user_interaction_dashcam_launcher_action_tapped: {
    label: 'App',
    icon: ['fas', 'mobile-screen-button'],
  },
  user_interaction_dashcam_multifunction_selected: {
    label: 'Wheel',
    icon: ['fas', 'steering-wheel'],
  },
  user_interaction_honk: {
    label: 'Honk',
    icon: ['fas', 'bullhorn'],
  },
  sentry_aware_object_detection: {
    label: 'Sentry',
    icon: ['fas', 'eye'],
  },
  sentry_locked_handle_pulled: {
    label: 'Handle',
    icon: ['fas', 'hand-back-fist'],
  },
  vehicle_auto_emergency_braking: {
    label: 'AEB',
    icon: ['fas', 'car-burst'],
  },
}

const PREFIX_REASONS: Array<{ prefix: string; presentation: ReasonPresentation }> = [
  {
    prefix: 'sentry_aware',
    presentation: {
      label: 'Sentry',
      icon: ['fas', 'shield-halved'],
    },
  },
  {
    prefix: 'user_interaction',
    presentation: {
      label: 'Manual',
      icon: ['fas', 'hand'],
    },
  },
  {
    prefix: 'vehicle_',
    presentation: {
      label: 'Vehicle',
      icon: ['fas', 'car'],
    },
  },
]

function formatReasonFallback(reason: string): string {
  return reason
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export type EventTypeFilter = 'all' | 'sentry' | 'manual' | 'vehicle' | 'other'

export const EVENT_TYPE_FILTER_OPTIONS: Array<{
  value: EventTypeFilter
  label: string
  icon: IconDefinition
}> = [
  { value: 'all', label: 'All types', icon: ['fas', 'layer-group'] },
  { value: 'sentry', label: 'Sentry', icon: ['fas', 'shield-halved'] },
  { value: 'manual', label: 'Manual saves', icon: ['fas', 'hand'] },
  { value: 'vehicle', label: 'Vehicle events', icon: ['fas', 'car'] },
  { value: 'other', label: 'Other', icon: ['fas', 'circle-question'] },
]

export function getEventTypeFilterKey(reason: string | null | undefined): Exclude<EventTypeFilter, 'all'> {
  if (!reason) {
    return 'other'
  }
  if (reason.startsWith('sentry_')) {
    return 'sentry'
  }
  if (reason.startsWith('user_interaction')) {
    return 'manual'
  }
  if (reason.startsWith('vehicle_')) {
    return 'vehicle'
  }
  return 'other'
}

export function getReasonPresentation(reason: string | null | undefined): ReasonPresentation {
  if (!reason) {
    return {
      label: 'Unknown',
      icon: ['fas', 'video'],
    }
  }

  const exact = EXACT_REASONS[reason]
  if (exact) {
    return exact
  }

  for (const entry of PREFIX_REASONS) {
    if (reason.startsWith(entry.prefix)) {
      return entry.presentation
    }
  }

  return {
    label: formatReasonFallback(reason),
    icon: ['fas', 'circle-info'],
  }
}
