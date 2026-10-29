import { router, useScrollToTop } from "expo-router";
import { SPANISH_REVIEWED, t } from "../../i18n";
import { setLangPref, useLangPref, type LangPref } from "../../i18n/prefs";
import { useEffect, useState, useRef } from "react";
import { Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { signOut } from "../../auth/signIn";
import { Button, ErrorText, fonts, makeStyles, Muted, SectionTitle, Text, useColors } from "../../components/ui";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { db, storage } from "../../firebase";
import { makeExport } from "../../lib/exportPrayers";
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from "../../lib/appearance";
import { setLiveActivityEnabled, useLiveActivityEnabled } from "../../lib/liveActivity";
import { openPrivacyPolicy } from "../../lib/links";
import { setReminderEnabled, useReminderEnabled } from "../../lib/reminder";
import { setShowPrayingNames, useShowPrayingNames } from "../../lib/prayingPrefs";
import { setTextSize, TEXT_SIZES, useTextSize } from "../../lib/textSize";
import { openPhoneSettings, setNotificationsEnabled, useNotificationPermission, useNotificationsEnabled } from "../../lib/notifications";
import { isTranslationId, TRANSLATIONS, type TranslationId } from "../../lib/scripture/translations";
import { setBibleVersion } from "../../lib/settings";
import { unblockUser } from "../../lib/moderation";
import { SelectField } from "../../components/SelectField";
import { spokenLanguage, spokenPassage } from "../../lib/verseSpeech";
import { englishVoices, SAMPLE_REF, setVoicePrefs, SPEEDS, useVoicePrefs, type VoiceChoice } from "../../lib/voicePrefs";
import { useBlocked, usePassage, useSettings } from "../../session/hooks";
import { phoneVoices, useVerseSpeech } from "../../session/useVerseSpeech";
import { useProfiles } from "../../session/useProfiles";
import { useReadySession } from "../../session/SessionProvider";
import { InfoLabel } from "../../components/InfoLabel";
import { NOTIFY_KINDS, type NotifyKind } from "../../lib/notifyPrefs";
import { pushAvailable } from "../../lib/push";
import { useNotifyPrefs } from "../../session/useActivityNotifications";

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
        <InfoLabel
          label={t("settings.promptNotifications")}
          // A problem to fix stays visible below; plain explanations fold away.
          info={notifications.status === "denied" && notificationsOn
            ? undefined
            : notificationsOn && notifications.status === "granted" ? t("settings.notifOn") : t("settings.notifOff")}
          right={
            <Switch
              value={notificationsOn && notifications.status === "granted"}
              onValueChange={toggleNotifications}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("settings.promptNotifications")}
            />
          }
        />
        {notifications.status === "denied" && notificationsOn && <Muted>{t("settings.notifBlocked")}</Muted>}
        {notifications.status === "denied" && notificationsOn && (
          <Button title={t("settings.openPhoneSettings")} kind="secondary" onPress={openPhoneSettings} />
        )}
        {Platform.OS === "ios" && (
          <>
            <InfoLabel
              label={t("settings.lockScreen")}
              info={liveActivity ? t("settings.lockScreenOn") : t("settings.lockScreenOff")}
              right={
                <Switch
                  value={liveActivity}
                  onValueChange={setLiveActivityEnabled}
                  trackColor={{ true: colors.accent, false: colors.border }}
                  accessibilityLabel={t("settings.lockScreen")}
                />
              }
            />
          </>
        )}
        <InfoLabel
          label={t("settings.reminder")}
          info={reminder ? t("settings.reminderOn") : t("settings.reminderOff")}
          right={
            <Switch
              value={reminder}
              onValueChange={setReminderEnabled}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("settings.reminder")}
            />
          }
        />
        {pushAvailable() && <ActivitySwitches />}
      </View>

      <SectionTitle>{t("settings.prayerRequests")}</SectionTitle>
      <View style={styles.card}>
        <InfoLabel
          label={t("settings.showPraying")}
          info={`${showPrayingNames ? t("settings.showPrayingOn") : t("settings.showPrayingOff")} ${t("settings.neverNotified")}`}
          right={
            <Switch
              value={showPrayingNames}
              onValueChange={setShowPrayingNames}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("settings.showPrayingA11y")}
            />
          }
        />
      </View>

      <ListenSettings />

      <LanguageSettings />

      <InfoLabel section label={t("settings.appearance")} info={t("settings.appearanceNote")} />
      <View style={styles.card}>
        {APPEARANCE_OPTIONS.map((o) => (
          <Option key={o.id} label={o.label} selected={appearance === o.id} onPress={() => setAppearance(o.id)} />
        ))}
      </View>

      <InfoLabel section label={t("settings.textSize")} info={t("settings.textSizeNote")} />
      <View style={styles.card}>
        {TEXT_SIZES.map((size) => (
          <Option key={size.id} label={size.label} selected={textSize === size.id} onPress={() => setTextSize(size.id)} />
        ))}
      </View>

      <InfoLabel section label={t("settings.bibleTranslation")} info={t("settings.bibleTranslationNote")} />
      <View style={styles.card}>
        <SelectField
          title={t("settings.bibleTranslation")}
          value={settings.bibleVersion}
          onChange={(id) => { if (isTranslationId(id)) void choose(id); }}
          options={TRANSLATIONS.map((tr) => ({ value: tr.id, label: `${tr.name} (${tr.id})`, detail: t(`translation.about.${tr.id}`) }))}
          placeholder={t("settings.bibleTranslation")}
          noneLabel={null}
        />
      </View>
      {error && <ErrorText>{error}</ErrorText>}

      <BlockedPeople />

      <InfoLabel section label={t("settings.help")} info={t("settings.howItWorksNote")} />
      <View style={styles.card}>
        <Button title={t("settings.howItWorks")} kind="secondary" onPress={() => router.push("/welcome")} />
        <Button title={t("settings.privacy")} kind="secondary" onPress={openPrivacyPolicy} />
      </View>

      <DownloadMyPrayers />

      <View style={styles.spacer} />
      <Button title={t("settings.signOut")} kind="secondary" onPress={() => signOut()} />
      <Button title={t("settings.deleteAccount")} kind="danger" onPress={() => router.push("/delete-account")} />
    </ScrollView>
  );
}

/** Opt-in notifications about my own things: all off until turned on. */
function ActivitySwitches() {
  const styles = useStyles();
  const colors = useColors();
  const { prefs, loaded, set } = useNotifyPrefs();
  const [error, setError] = useState(false);
  const labels: Record<NotifyKind, string> = {
    taps: t("settings.notifyTaps"),
    reactions: t("settings.notifyReactions"),
    comments: t("settings.notifyComments"),
  };
  return (
    <>
      <InfoLabel label={t("settings.notifyHeading")} info={t("settings.notifyNote")} style={styles.subheading} />
      {NOTIFY_KINDS.map((kind) => (
        <View key={kind} style={styles.option}>
          <Text style={styles.optionText}>{labels[kind]}</Text>
          <Switch
            value={!!prefs?.[kind]}
            disabled={!loaded}
            onValueChange={(on) => { setError(false); set(kind, on).catch(() => setError(true)); }}
            trackColor={{ true: colors.accent, false: colors.border }}
            accessibilityLabel={labels[kind]}
          />
        </View>
      ))}
      {error && <ErrorText>{t("common.tryAgain")}</ErrorText>}
    </>
  );
}

/**
 * "Download my prayers": my own posts, photos and saved verses as one file,
 * made on the phone and handed to the share sheet (lib/exportPrayers.ts).
 * The file is deleted from the phone once the share sheet closes.
 */
function DownloadMyPrayers() {
  const styles = useStyles();
  const colors = useColors();
  const { profile } = useReadySession();
  const settings = useSettings();
  const [photos, setPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    setProgress(null);
    let file: File | null = null;
    try {
      const { html, count } = await makeExport(
        { db, storage },
        { uid: profile.uid, name: profile.displayName, translation: settings.bibleVersion },
        { photos, onProgress: (done, total) => setProgress({ done, total }) },
      );
      if (count === 0) {
        setMessage({ error: false, text: t("settings.downloadNone") });
        return;
      }
      file = new File(Paths.cache, "PrayAlong prayers.html");
      if (file.exists) file.delete();
      file.write(html);
      await Sharing.shareAsync(file.uri, { mimeType: "text/html", UTI: "public.html", dialogTitle: t("settings.download") });
    } catch (err) {
      console.warn("download my prayers failed", err);
      setMessage({ error: true, text: t("settings.downloadFailed") });
    } finally {
      // Nothing is left behind on the phone.
      try { if (file?.exists) file.delete(); } catch { /* already gone */ }
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <InfoLabel section label={t("settings.yourData")} info={t("settings.downloadNote")} />
      <View style={styles.card}>
        <InfoLabel
          label={t("settings.downloadPhotos")}
          right={
            <Switch
              value={photos}
              onValueChange={setPhotos}
              disabled={busy}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel={t("settings.downloadPhotos")}
            />
          }
        />
        <Button title={t("settings.download")} kind="secondary" onPress={download} busy={busy} />
        {progress && progress.total > 0 && <Text style={styles.optionText}>{t("settings.downloadPreparing", progress)}</Text>}
        {message && (message.error ? <ErrorText>{message.text}</ErrorText> : <Text style={styles.optionText}>{message.text}</Text>)}
      </View>
    </>
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
      <InfoLabel section label={t("settings.listen")} info={t("settings.listenNote")} />
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
      <InfoLabel section label={t("settings.language")} info={SPANISH_REVIEWED ? t("settings.languageNoteReviewed") : t("settings.languageNote")} />
      <View style={styles.card}>
        {options.map((o) => (
          <Option key={o.id} label={o.label} selected={pref === o.id} onPress={() => setLangPref(o.id)} />
        ))}
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
      <InfoLabel section label={t("settings.blockedPeople")} info={t("settings.blockedNote")} />
      <View style={styles.card}>
        {[...blocked].map((uid) => (
          <View key={uid} style={styles.option}>
            <Text style={styles.optionText}>{names.get(uid)?.displayName ?? "…"}</Text>
            <Button title={t("settings.unblock")} kind="secondary" onPress={() => unblockUser(db, profile.uid, uid).catch(() => {})} />
          </View>
        ))}
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
  optionText: { fontSize: 16, color: colors.text },
  check: { fontSize: 17, color: colors.accent, fontFamily: fonts.bodySemiBold },
  spacer: { height: 16 },
  subheading: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.muted },
}));
