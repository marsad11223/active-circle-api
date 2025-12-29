import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/schemas/user.schema';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { ContactUsDto } from './dto/contact-us.dto';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { IsAdmin, canAccessResource } from 'src/utils/helper';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('')
  findAll(@GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create')
  create(@Body() createUserDto: CreateUserDto, @GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.create(createUserDto);
  }

  @Post('contactUs')
  contactUs(@Body() contactUs: ContactUsDto) {
    return this.usersService.contactUs(contactUs);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.remove(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser() user: User,
  ) {
    // Check authorization: superAdmin can update anyone, users can only update themselves
    canAccessResource(user, id);
    return this.usersService.update(id, updateUserDto, user);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('toggle-role')
  toggleRole(@GetUser() user: any) {
    // Users can only toggle their own role
    return this.usersService.toggleRole(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('favorites/toggle')
  toggleFavorite(
    @Body() toggleFavoriteDto: ToggleFavoriteDto,
    @GetUser() user: any,
  ) {
    // Members can add/remove favorites
    return this.usersService.toggleFavoriteActivity(
      user._id.toString(),
      toggleFavoriteDto.activityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('favorites')
  getFavoriteActivities(@GetUser() user: any) {
    // Members can view their favorites
    return this.usersService.getFavoriteActivities(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: User) {
    // Check authorization: superAdmin can view anyone, users can only view themselves
    canAccessResource(user, id);
    return this.usersService.findOne(id);
  }
}
