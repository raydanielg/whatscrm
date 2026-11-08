/**
 * Reusable dashboard widgets. Import from a single path:
 *
 *   import {
 *     WidgetCard, StatisticCard, RevenueCard, GrowthCard,
 *     ChartWidget, DonutWidget,
 *     ActivityFeed, TaskListWidget, UpcomingEvents, CalendarWidget,
 *     PerformanceCard, QuickActions, NotificationWidget,
 *     RecentCustomers, RecentConversations, RecentDeals,
 *     UsageCard, StorageCard, SubscriptionCard, RealtimeActivity,
 *   } from "@/shared/widgets";
 *
 * Every widget consumes semantic design tokens (no hardcoded colors) and
 * inherits light/dark theme automatically.
 */
export { WidgetCard, type WidgetCardProps } from "./widget-card";
export { DeltaPill, type DeltaPillProps, type DeltaTone } from "./delta-pill";
export { StatisticCard } from "./statistic-card";
export { RevenueCard, type RevenueCardProps } from "./revenue-card";
export { GrowthCard, type GrowthCardProps } from "./growth-card";
export { ChartWidget, DonutWidget, CHART_COLORS, type ChartWidgetProps, type DonutWidgetProps } from "./chart-widget";
export { ActivityFeed, type ActivityFeedProps, type ActivityItem } from "./activity-feed";
export { TaskListWidget, type TaskListWidgetProps, type TaskItem } from "./task-list-widget";
export { UpcomingEvents, type UpcomingEventsProps, type EventItem } from "./upcoming-events";
export { CalendarWidget, type CalendarWidgetProps } from "./calendar-widget";
export { PerformanceCard, type PerformanceCardProps, type PerformanceMetric } from "./performance-card";
export { QuickActions, type QuickActionsProps, type QuickAction } from "./quick-actions";
export { NotificationWidget, type NotificationWidgetProps, type Notification } from "./notification-widget";
export {
  RecentCustomers, RecentConversations, RecentDeals,
  type RecentCustomersProps, type CustomerItem,
  type RecentConversationsProps, type ConversationItem,
  type RecentDealsProps, type DealItem,
} from "./recent-list";
export { UsageCard, StorageCard, type UsageCardProps, type StorageCardProps } from "./usage-card";
export { SubscriptionCard, type SubscriptionCardProps } from "./subscription-card";
export { RealtimeActivity, type RealtimeActivityProps, type RealtimePresence } from "./realtime-activity";
export { formatCurrency, formatCompact, formatPercent, formatBytes, formatRelativeTime } from "./format";
