import { FlatList } from "react-native";
import { OwnPostActions } from "../../components/OwnPostActions";
import { PostCard } from "../../components/PostCard";
import { makeStyles, Muted } from "../../components/ui";
import { useMyPosts } from "../../session/hooks";
import { useReadySession } from "../../session/SessionProvider";

export default function HistoryScreen() {
  const styles = useStyles();
  const { profile } = useReadySession();
  const { posts, loaded } = useMyPosts();
  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={posts}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={loaded ? <Muted>Your past prayers will appear here.</Muted> : null}
      renderItem={({ item }) => (
        <PostCard post={item} author={profile} footer={<OwnPostActions post={item} />} />
      )}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
}));
