import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async register(@Body() createUserDto: CreateUserDto): Promise<any> {
    return await this.authService.register(createUserDto);
  }

  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto): Promise<any> {
    return await this.authService.login(loginUserDto);
  }

  @Post('resetPassword')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<any> {
    return await this.authService.resetPassword(resetPasswordDto);
  }
}
