import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 11, fontWeight: '600', color: focused ? t.colors.primary : t.colors.mutedFg }}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const unread = useAppStore((s) => s.unreadInbox);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.mutedFg,
        tabBarStyle: { backgroundColor: t.colors.background, borderTopColor: t.colors.border, height: 64 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon label="◆" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} />,
        }}
      />
      <Tabs.Screen name="crm" options={{ title: 'CRM', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="ai" options={{ title: 'AI', tabBarIcon: ({ focused }) => <TabIcon label="✦" focused={focused} /> }} />
      <Tabs.Screen name="commerce" options={{ title: 'Commerce', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="workspaces" options={{ title: 'Spaces', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="security" options={{ title: 'Security', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ focused }) => <TabIcon label="●" focused={focused} /> }} />
    </Tabs>
  );
}
