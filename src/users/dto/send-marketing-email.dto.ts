import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMarketingEmailDto {
  @IsString()
  @MinLength(1, { message: 'Subject is required' })
  subject: string;

  /** Optional short message – injected into the backend template. If empty, template uses default copy. */
  @IsOptional()
  @IsString()
  message?: string;

  /** If true (default), only send to users with marketingEmails === true. If false, send to all members. */
  @IsOptional()
  @IsBoolean()
  respectMarketingPreference?: boolean;

  /** If true, send only to TEST_EMAIL (e.g. marsad11223@gmail.com) for testing. No emails go to real members. */
  @IsOptional()
  @IsBoolean()
  testMode?: boolean;
}
