import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GrantRole, Role, User } from 'src/schemas/user.schema';
import mongoose from 'mongoose';

/**
 * Normalize email for storage and lookup: lowercase + strip Gmail-style plus alias.
 * So marsad11223+1@gmail.com and Marsad11223@gmail.com both become marsad11223@gmail.com.
 * One account per "real" inbox; login is case-insensitive.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const localBeforePlus = local.includes('+') ? local.split('+')[0] : local;
  return `${localBeforePlus}@${domain}`;
}

export function IsAdmin(user: User) {
  if (user.role !== Role.superAdmin) {
    throw new BadRequestException('Only Admin can perform this action');
  }
}

/** True if user can create activities (premium member, standard member plan, or super admin) */
export function isHostOrStandardHost(
  user: User & { role?: Role; grantRole?: GrantRole },
): boolean {
  return (
    user?.role === Role.premiumMember ||
    user?.grantRole === GrantRole.host ||
    user?.role === Role.standardMember ||
    user?.role === Role.superAdmin
  );
}

/**
 * Check if user can update/access a resource
 * - superAdmin can access any resource
 * - Regular users can only access their own resource
 */
export function canAccessResource(
  currentUser: User & { _id?: mongoose.Types.ObjectId },
  resourceUserId: string | mongoose.Types.ObjectId,
): void {
  // SuperAdmin can access any resource
  if (currentUser.role === Role.superAdmin) {
    return;
  }

  // Regular users can only access their own resource
  const currentUserId = currentUser._id?.toString();
  const targetUserId =
    typeof resourceUserId === 'string'
      ? resourceUserId
      : resourceUserId.toString();

  if (!currentUserId || currentUserId !== targetUserId) {
    throw new ForbiddenException(
      'You do not have permission to access this resource',
    );
  }
}

export function generateStrongPassword(): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  const passwordLength = Math.floor(Math.random() * (16 - 8 + 1)) + 8; // Random length between 8 and 16

  for (let i = 0; i < passwordLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    password += characters[randomIndex];
  }

  return password;
}
