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
import { AdminListUsersDto } from './dto/admin-list-users.dto';
import { Query } from '@nestjs/common';

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
  async remove(@Param('id') id: string, @GetUser() user: User) {
    const requesterId = (user as any)._id.toString();
    const targetUserId = id === 'me' ? requesterId : id;

    if (targetUserId !== requesterId) {
      IsAdmin(user);
    }

    return this.usersService.remove(targetUserId);
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

  // Admin endpoints - Must be before :id route to avoid route conflicts
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/members')
  getAllMembers(@Query() filters: AdminListUsersDto, @GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.getAllMembers(filters);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('admin/:id/suspend')
  suspendUserByAdmin(
    @Param('id') id: string,
    @Body() body: { suspend: boolean; reason?: string },
    @GetUser() user: User,
  ) {
    // Admin only
    IsAdmin(user);
    const { suspend, reason } = body;
    return this.usersService.suspendUser(id, suspend, reason);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('admin/hosts')
  getAllHosts(@Query() filters: AdminListUsersDto, @GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.getAllHosts(filters);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @GetUser() user: User,
    @Query('includeRatings') includeRatings?: string,
    @Query('includePaymentHistory') includePaymentHistory?: string,
  ) {
    // Check authorization: superAdmin can view anyone, users can only view themselves
    canAccessResource(user, id);

    const options = {
      includeRatings: includeRatings === 'true',
      includePaymentHistory: includePaymentHistory === 'true',
    };

    return this.usersService.findOne(id, options);
  }
}
