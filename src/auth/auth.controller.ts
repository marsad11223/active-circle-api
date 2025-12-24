import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GetUser } from './GetUser.Decorator';

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

  // forgot password
  @Post('forgotPassword')
  async forgotPassword(
    @Body() { email }: { email: string },
  ): Promise<{ message: string }> {
    return await this.authService.forgotPassword(email);
  }

  @Post('resetPassword')
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<any> {
    return await this.authService.resetPassword(resetPasswordDto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('changePassword')
  async changePassword(
    @GetUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return await this.authService.changePassword(
      user._id.toString(),
      changePasswordDto,
    );
  }
}
