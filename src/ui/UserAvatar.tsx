import type { User } from '../api/types';

type Props = {
  user: User;
  size?: number;
};

export function UserAvatar({ user, size = 24 }: Props) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: '50%', display: 'block' }}
      />
    );
  }
  return (
    <span
      className="taco-user-pill-fallback"
      style={{ width: size, height: size, display: 'inline-flex' }}
    >
      {user.displayName.charAt(0)}
    </span>
  );
}
