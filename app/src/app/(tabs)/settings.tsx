import { router, useScrollToTop } from "expo-router";
import { SPANISH_REVIEWED, t } from "../../i18n";
import { setLangPref, useLangPref, type LangPref } from "../../i18n/prefs";
import { useEffect, useState, useRef } from "react";
import { Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text, useColors } from "../../components/ui";
import { db } from "../../firebase";
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from "../../lib/appearance";
import { setLiveActivityEnabled, useLiveActivityEnabled } from "../../lib/liveActivity";
import { openPrivacyPolicy } from "../../lib/links";
import { setReminderEnabled, useReminderEnabled } from "../../lib/reminder";
import { setShowPrayingNames, useShowPrayingNames } from "../../lib/prayingPrefs";
import { setTextSize, TEXT_SIZES, useTextSize } from "../../lib/textSize";
import { openPhoneSettings, setNotificationsEnabled, useNotificationPermission, useNotificationsEnabled } from "../../lib/notifications";
import { TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { unblockUser } from "../../lib/moderation";
import { SelectField } from "../../components/SelectField";
import { spokenLanguage, spokenPassage } from "../../lib/verseSpeech";
import { englishVoices, SAMPLE_REF, setVoicePrefs, SPEEDS, useVoicePrefs, type VoiceChoice } from "../../lib/voicePrefs";
import { useBlocked, usePassage, useSettings } from "../../session/hooks";
import { phoneVoices, useVerseSpeech } from "../../session/useVerseSpeech";
import { useProfiles } from "../../session/useProfiles";
import { useReadySession } from "../../session/SessionProvider";

export default function SettingsScreen() {
  // Tapping this tab again scrolls back to the top.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const styles = useStyles();
  const { profile } = useReadySession();
  const settings = useSettings();
  const appearance = useAppearance();
  const textSize = useTextSize();
  const showPrayingNames = useShowPrayingNames();
  const notifications = useNotificationPermission();
  const notificationsOn = useNotificationsEnabled();
  const colors = useColors();
  const liveActivity = useLiveActivityEnabled();
  const reminder = useReminderEnabled();

  async function toggleNotifications(on: boolean) {
    setNotificationsEnabled(on);
    // Turning on for the first time asks iOS; if iOS was refused before,
    // only the phone's Settings can change it (the note below says so).
    if (on && notifications.status === "undetermined") await notifications.request();
  }
  const [error, setError] = useState<string | null>(null);

  async function choose(id: TranslationId) {
    setError(null);
    try {
      await setBibleVersion(db, profile.uid, id);
    } catch {
      setError(t("settings.couldntSave"));
    }
  }

  return (
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.content}>
      <SectionTitle>{t("settings.notifications")}</SectionTitle>
      <View style={styles.card}>
        <View style={styles.option}>
          <Text style={styles.optionText}>{t("settings.promptNotifications")}</Text>
          <Switch
            value={notificationsOn && notifications.status === "granted"}
            onValueChange={toggleNotifications}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t("settings.promptNotifications")}
          />
        </View>
        <Muted>
          {notifications.status === "denied" && notificationsOn
            ? t("settings.notifBlocked")
            : notificationsOn && notifications.status === "granted"
              ? t("settings.notifOn")
              : t("settings.notifOff")}
        </Muted>
        {notifications.status === "denied" && notificationsOn && (
          <Button title={t("settings.openPhoneSettings")} kind="secondary" onPress={openPhoneSettings} />
        )}
        {Platform.OS === "ios" && (
          <>
            <View style={styles.option}>
              <Text style={styles.optionText}>{t("settings.lockScreen")}</Text>
              <Switch
                value={liveActivity}
                onValueChange={setLiveActivityEnabled}
                trackColor={{ true: colors.accent, false: colors.border }}
                accessibilityLabel={t("settings.lockScreen")}
              />
            </View>
            <Muted>
              {liveActivity
                ? t("settings.lockScreenOn")
                : t("settings.lockScreenOff")}
            </Muted>
          </>
        )}
        <View style={styles.option}>
          <Text style={styles.optionText}>{t("settings.reminder")}</Text>
          <Switch
            value={reminder}
            onValueChange={setReminderEnabled}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t("settings.reminder")}
          />
        </View>
        <Muted>{reminder ? t("settings.reminderOn") : t("settings.reminderOff")}</Muted>
      </View>

      <SectionTitle>{t("settings.prayerRequests")}</SectionTitle>
      <View style={styles.card}>
        <View style={styles.option}>
          <Text style={styles.optionText}>{t("settings.showPraying")}</Text>
          <Switch
            value={showPrayingNames}
            onValueChange={setShowPrayingNames}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={t("settings.showPrayingA11y")}
          />
        </View>
        <Muted>
          {showPrayingNames
            ? t("settings.showPrayingOn")
            : t("settings.showPrayingOff")}{" "}
          {t("settings.neverNotified")}
        </Muted>
      </View>

      <ListenSettings />

      <LanguageSettings />

      <SectionTitle>{t("settings.appearance")}</SectionTitle>
      <View style={styles.card}>
        {APPEARANCE_OPTIONS.map((o) => (
          <Option key={o.id} label={o.label} selected={appearance === o.id} onPress={() => setAppearance(o.id)} />
        ))}
        <Muted>{t("settings.appearanceNote")}</Muted>
      </View>

      <SectionTitle>{t("settings.textSize")}</SectionTitle>
      <View style={styles.card}>
        {TEXT_SIZES.map((size) => (
          <Option key={size.id} label={size.label} selected={textSize === size.id} onPress={() => setTextSize(size.id)} />
        ))}
        <Muted>{t("settings.textSizeNote")}</Muted>
      </View>

      <SectionTitle>{t("settings.bibleTranslation")}</SectionTitle>
      <View style={styles.card}>
        {TRANSLATIONS.map((tr) => (
          <Option key={tr.id} label={`${tr.name} (${tr.id})`} selected={settings.bibleVersion === tr.id} onPress={() => choose(tr.id)} />
        ))}
        <Muted>{t("settings.bibleTranslationNote")}</Muted>
      </View>
      {error && <ErrorText>{error}</ErrorText>}

      <BlockedPeople />

      <SectionTitle>{t("settings.help")}</SectionTitle>
      <View style={styles.card}>
        <Button title={t("settings.howItWorks")} kind="secondary" onPress={() => router.push("/welcome")} />
        <Muted>{t("settings.howItWorksNote")}</Muted>
        <Button title={t("settings.privacy")} kind="secondary" onPress={openPrivacyPolicy} />
      </View>

      <View style={styles.spacer} />
      <Button title={t("settings.signOut")} kind="secondary" onPress={() => signOut()} />
      <Button title={t("settings.deleteAccount")} kind="danger" onPress={() => router.push("/delete-account")} />
    </ScrollView>
  );
}

/** Listen: the phone voice and speed used to read verses aloud, with a sample. */
function ListenSettings() {
  const styles = useStyles();
  const prefs = useVoicePrefs();
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  useEffect(() => {
    let live = true;
    phoneVoices().then((v) => { if (live) setVoices(englishVoices(v)); }, () => {});
    return () => { live = false; };
  }, []);
  const { passage } = usePassage(SAMPLE_REF);
  const { speaking, toggle } = useVerseSpeech("settings-sample");
  return (
    <>
      <SectionTitle>{t("settings.listen")}</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.optionText}>{t("settings.voice")}</Text>
        <SelectField
          title={t("settings.voice")}
          value={prefs.voice ?? ""}
          onChange={(id) => {
            const v = voices.find((x) => x.identifier === id);
            setVoicePrefs({ voice: v?.identifier ?? null, language: v?.language ?? null });
          }}
          options={voices.map((v) => ({ value: v.identifier, label: v.label }))}
          placeholder={t("settings.defaultVoice")}
          noneLabel={t("settings.defaultVoice")}
        />
        <Text style={styles.optionText}>{t("settings.speed")}</Text>
        {SPEEDS.map((sp) => (
          <Option key={sp.id} label={sp.label} selected={prefs.speed === sp.id} onPress={() => setVoicePrefs({ speed: sp.id })} />
        ))}
        {passage && (
          <Button
            title={speaking ? t("settings.stop") : t("settings.playSample", { reference: passage.reference })}
            kind="secondary"
            onPress={() => toggle(spokenPassage(passage), spokenLanguage(passage))}
          />
        )}
        <Muted>{t("settings.listenNote")}</Muted>
      </View>
    </>
  );
}

/**
 * Language: follow the phone, or English / Español. Each language is named
 * in its own language. Spanish says it's under review until it has been.
 */
function LanguageSettings() {
  const styles = useStyles();
  const pref = useLangPref();
  const options: { id: LangPref; label: string }[] = [
    { id: "system", label: t("settings.matchPhone") },
    { id: "en", label: "English" },
    { id: "es", label: SPANISH_REVIEWED ? "Español" : "Español (en revisión)" },
  ];
  return (
    <>
      <SectionTitle>{t("settings.language")}</SectionTitle>
      <View style={styles.card}>
        {options.map((o) => (
          <Option key={o.id} label={o.label} selected={pref === o.id} onPress={() => setLangPref(o.id)} />
        ))}
        <Muted>{SPANISH_REVIEWED ? t("settings.languageNoteReviewed") : t("settings.languageNote")}</Muted>
      </View>
    </>
  );
}

/** People I've blocked, with Unblock. Unblocking doesn't restore the friendship. */
function BlockedPeople() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const blocked = useBlocked();
  const names = useProfiles([...blocked]);
  if (blocked.size === 0) return null;
  return (
    <>
      <SectionTitle>{t("settings.blockedPeople")}</SectionTitle>
      <View style={styles.card}>
        {[...blocked].map((uid) => (
          <View key={uid} style={styles.option}>
            <Text style={styles.optionText}>{names.get(uid)?.displayName ?? "…"}</Text>
            <Button title={t("settings.unblock")} kind="secondary" onPress={() => unblockUser(db, profile.uid, uid).catch(() => {})} />
          </View>
        ))}
        <Muted>{t("settings.blockedNote")}</Muted>
      </View>
    </>
  );
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.option}>
      <Text style={styles.optionText}>{label}</Text>
      {selected && <Text style={styles.check}>✓</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44 },
  optionText: { fontSize: 17, color: colors.text },
  check: { fontSize: 18, color: colors.accent, fontFamily: fonts.serifSemiBold },
  spacer: { height: 16 },
}));
