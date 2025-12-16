import { BadRequestException } from '@nestjs/common';
import { Role, User } from 'src/schemas/user.schema';

export function IsAdmin(user: User) {
  if (user.role !== Role.superAdmin && user.role !== Role.host) {
    throw new BadRequestException('Only Admin can perform this action');
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
