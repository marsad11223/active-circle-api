import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, User } from 'src/schemas/user.schema';
import mongoose from 'mongoose';

export function IsAdmin(user: User) {
  if (user.role !== Role.superAdmin) {
    throw new BadRequestException('Only Admin can perform this action');
  }
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
