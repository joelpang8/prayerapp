import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { containerBackground, font, foregroundStyle, kerning, lineLimit, textCase, widgetURL } from "@expo/ui/swift-ui/modifiers";
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
  // Lock Screen: plain, so iOS tints it to match the clock.
  if (environment.widgetFamily === "accessoryInline") {
    return <Text modifiers={[widgetURL("prayerapp://prayers")]}>{props.name ? `🙏 ${props.name}` : props.empty}</Text>;
  }
  if (environment.widgetFamily === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL("prayerapp://prayers")]}>
        <Text modifiers={[font({ size: 12, weight: "semibold" })]}>{props.title}</Text>
        <Text modifiers={[font({ size: 17, weight: "bold" }), lineLimit(1)]}>{props.name || props.empty}</Text>
        {props.more ? <Text modifiers={[font({ size: 12 })]}>{props.more}</Text> : null}
      </VStack>
    );
  }
  // Home Screen: the app's purple, light or dark with the phone (colors as in ui.tsx).
  const dark = environment.colorScheme === "dark";
  const accent = dark ? "#B9AAE6" : "#5B4B8A";
  const ink = dark ? "#EEE7DB" : "#1F1B16";
  const wash = dark ? ["#2D2742", "#1F1A2E"] : ["#F1ECF8", "#E2D8F1"];
  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[
        widgetURL("prayerapp://prayers"),
        containerBackground({ type: "linearGradient", colors: wash, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }, "widget"),
      ]}
    >
      <HStack spacing={0}>
        <Text modifiers={[font({ size: 11.5, weight: "bold" }), kerning(0.9), textCase("uppercase"), foregroundStyle(accent)]}>{`☀︎ ${props.title}`}</Text>
        <Spacer />
      </HStack>
      <Text modifiers={[font({ size: 20, weight: "bold" }), lineLimit(3), foregroundStyle(ink)]}>{props.name || props.empty}</Text>
      <Spacer />
      {props.more ? <Text modifiers={[font({ size: 12.5, weight: "semibold" }), foregroundStyle(accent)]}>{props.more}</Text> : null}
    </VStack>
  );
};

export default createWidget("PrayForWidget", PrayForWidget);
