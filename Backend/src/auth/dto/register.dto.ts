export class RegisterDto {
  handle!: string;
  displayName!: string;
  password!: string;
  bio?: string;
  avatarSmallUrl?: string;
  avatarLargeUrl?: string;
  isPrivate?: boolean;
}
