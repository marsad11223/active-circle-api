import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/schemas/user.schema';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailerService } from '@nestjs-modules/mailer';
import { generateStrongPassword } from 'src/utils/helper';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.userModel.findOne({ email: createUserDto.email });

    if (!user) {
      try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

        const newUser = await this.userModel.create({
          ...createUserDto,
          password: hashedPassword,
        });

        const payload = { id: newUser._id, email: newUser.email };
        const accessToken = this.jwtService.sign(payload);
        return {
          data: newUser,
          accessToken: accessToken,
        };
      } catch (err) {
        throw new BadRequestException(err.message);
      }
    } else {
      throw new ConflictException('User already Exist');
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<any> {
    const { email, password } = loginUserDto;
    const user = await this.userModel.findOne({ email: email });
    if (user) {
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new UnauthorizedException('Incorrect Email or Password');
      }

      const payload = { id: user._id, email: user.email };
      const accessToken = this.jwtService.sign(payload);
      return {
        data: user,
        accessToken: accessToken,
      };
    } else {
      throw new UnauthorizedException('Incorrect Email or Password');
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<any> {
    const { email } = resetPasswordDto;
    const password = generateStrongPassword();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('Email not found');
    }
    try {
      await this.userModel.findByIdAndUpdate(
        { _id: user._id },
        { password: hashedPassword, updated_at: Date.now() },
        { new: true },
      );
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Reset Password',
        text: `Your new password for BookmarkFoo is: ${password}`,
      });
      return {
        message: 'Your new password has been sent to your email.',
      };
    } catch (error) {
      throw new BadRequestException('Error while reseting password', error);
    }
  }
}
