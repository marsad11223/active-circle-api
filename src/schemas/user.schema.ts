import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum Role {
  SuperAdmin = 'SuperAdmin',
  SchoolAdmin = 'SchoolAdmin',
  User = 'User',
}

@Schema()
export class User {
  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop()
  password: string;

  @Prop({ default: Role.User })
  role: Role;

  @Prop()
  address: string;

  @Prop()
  phoneNumber: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
