import AppIntents
import UIKit

// "Hey Siri, add to my prayer list in PrayAlong": Siri asks who or what,
// then opens PrayAlong on "Add to my list" with the name filled in
// (prayerapp://prayer-list/edit?name=...). Nothing is saved until you tap
// Save, and nothing leaves the phone except through the app as usual.
// Copied into the app target by plugins/withPrayerListShortcut.js.

struct AddToPrayerListIntent: AppIntent {
  static let title: LocalizedStringResource = "Add to My Prayer List"
  static let description = IntentDescription("Add someone or something to your private prayer list in PrayAlong.")
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Who or what", requestValueDialog: IntentDialog("Who would you like to pray for?"))
  var name: String

  @MainActor
  func perform() async throws -> some IntentResult {
    var components = URLComponents()
    components.scheme = "prayerapp"
    components.host = "prayer-list"
    components.path = "/edit"
    components.queryItems = [URLQueryItem(name: "name", value: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60)))]
    if let url = components.url {
      await UIApplication.shared.open(url)
    }
    return .result()
  }
}

struct PrayAlongShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddToPrayerListIntent(),
      phrases: [
        "Add to my prayer list in \(.applicationName)",
        "Add someone to my \(.applicationName) prayer list",
        "Pray for someone in \(.applicationName)",
      ]
    )
  }
}
