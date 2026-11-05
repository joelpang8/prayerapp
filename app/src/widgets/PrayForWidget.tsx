import { Text, VStack } from "@expo/ui/swift-ui";
import { font, lineLimit, widgetURL } from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

/**
 * The "Pray for" widget (Lock Screen and Home Screen): one name from my own
 * Pray for today, and how many more. Only my prayer list, never anyone
 * else's content. Tapping opens the Prayers tab. The words come in as props
 * (the widget can't use the app's translations), from usePrayForWidget.
 *
 * Runs as SwiftUI inside the widget: no hooks, imports or outside values in
 * the function body (expo-widgets' 'widget' directive).
 */
export type PrayForProps = { title: string; name: string; more: string; empty: string };

const PrayForWidget = (props: PrayForProps, environment: WidgetEnvironment) => {
  "widget";
  if (environment.widgetFamily === "accessoryInline") {
    return <Text modifiers={[widgetURL("prayerapp://prayers")]}>{props.name ? `🙏 ${props.name}` : props.empty}</Text>;
  }
  return (
    <VStack alignment="leading" spacing={2} modifiers={[widgetURL("prayerapp://prayers")]}>
      <Text modifiers={[font({ size: 12, weight: "semibold" })]}>{props.title}</Text>
      <Text modifiers={[font({ size: 17, weight: "bold" }), lineLimit(2)]}>{props.name || props.empty}</Text>
      {props.more ? <Text modifiers={[font({ size: 12 })]}>{props.more}</Text> : null}
    </VStack>
  );
};

export default createWidget("PrayForWidget", PrayForWidget);
