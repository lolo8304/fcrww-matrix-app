import EmojiPicker, {EmojiStyle, Theme} from 'emoji-picker-react';

export default function ReactionPicker({onSelect}: {onSelect: (emoji: string) => void}) {
  return <EmojiPicker emojiStyle={EmojiStyle.NATIVE} theme={Theme.DARK} width="100%" height={390} searchPlaceHolder="Emoji suchen" previewConfig={{showPreview: false}} onEmojiClick={emoji => onSelect(emoji.emoji)} />;
}
