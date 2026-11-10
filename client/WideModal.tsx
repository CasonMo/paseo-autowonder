import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "./Text";
import { useI18n } from "./i18n";

export function WideModal({
  open,
  title,
  onClose,
  theme,
  maxWidth = 760,
  maxHeight = 860,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  theme: PluginTheme;
  maxWidth?: number;
  maxHeight?: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardWidth = Math.min(maxWidth, Math.max(240, windowWidth - 32));
  const cardHeight = Math.min(maxHeight, Math.max(240, windowHeight - 32));
  return (
    <NativeModal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          backgroundColor: "rgba(0, 0, 0, 0.45)",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("关闭")}
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            width: cardWidth,
            maxHeight: cardHeight,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface0,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: theme.colors.foreground,
                fontSize: 15,
                fontWeight: "600",
              }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("关闭")}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ padding: 16 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </NativeModal>
  );
}
