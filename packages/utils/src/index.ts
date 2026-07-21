export { formatBRL, formatDate, formatDateTime, formatTime, formatPercent, maskCPF, maskPhone, maskCNPJ } from './format'
export {
  CLIENT_TAGS,
  UNIT_TAG_PREFIX,
  unitTag,
  isUnitTag,
  unitTagName,
  type ClientTag,
} from './client-tags'
export {
  LEAD_SOURCES,
  LEAD_SOURCE_KEYS,
  sourceStyle,
  sourceTagFor,
  deriveLeadSource,
  resolveLeadSource,
  mergeTags,
  type LeadSource,
  type LeadSourceDef,
  type LeadSourceStyle,
  type AttributionInput,
  type InboundReferralAttribution,
  type DerivedSource,
} from './lead-source'
export {
  AWAITING_THRESHOLDS,
  STALE_THRESHOLDS,
  AGING_STYLE,
  secondsSince,
  agingLevel,
  formatDurationShort,
  formatDurationLong,
  type AgingLevel,
  type AgingThresholds,
} from './crm-metrics'
