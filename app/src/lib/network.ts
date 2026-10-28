import NetInfo, { useNetInfo, type NetInfoState } from "@react-native-community/netinfo";

// Only the phone's own view of its connection: no test requests to outside
// servers (NetInfo would otherwise ping a Google URL to check reachability).
NetInfo.configure({ useNativeReachability: true, reachabilityShouldRun: () => false });

/**
 * True only when the phone says it has no connection at all. Unknown (still
 * checking) counts as online, so the banner never flashes at startup.
 */
export function isOffline(state: Pick<NetInfoState, "isConnected">): boolean {
  return state.isConnected === false;
}

export function useOffline(): boolean {
  return isOffline(useNetInfo());
}
