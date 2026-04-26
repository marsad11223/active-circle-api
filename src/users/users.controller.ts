import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { User } from 'src/schemas/user.schema';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { ContactUsDto } from './dto/contact-us.dto';
import { SendMarketingEmailDto } from './dto/send-marketing-email.dto';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { IsAdmin, canAccessResource } from 'src/utils/helper';
import { AdminListUsersDto } from './dto/admin-list-users.dto';
import { Query } from '@nestjs/common';
import { GrantRole, Role } from 'src/schemas/user.schema';

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
    return this.usersService.update(id, updateUserDto);
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
  @Get('notifications')
  getNotifications(@GetUser() user: any) {
    return this.usersService.getNotifications(user._id.toString());
  }

  // Admin endpoints - Must be before :id route to avoid route conflicts
  @UseGuards(AuthGuard('jwt'))
  @Get('admin/overview')
  getAdminOverview(@GetUser() user: User) {
    IsAdmin(user);
    return this.usersService.getAdminOverview();
  }

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

  /** Admin: send marketing email to all members (one broadcast). Respects marketingEmails preference by default. */
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('admin/send-marketing-email')
  sendMarketingEmail(
    @Body() dto: SendMarketingEmailDto,
    @GetUser() user: User,
  ) {
    IsAdmin(user);
    return this.usersService.sendMarketingEmailToAll(dto);
  }

  /** Admin: send session reminders to members with confirmed bookings in the next X hours (default 24). Use ?testMode=true to send only to TEST_EMAIL. */
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin/send-session-reminders')
  sendSessionReminders(
    @Query('hoursAhead') hoursAheadStr: string,
    @Query('testMode') testModeStr: string,
    @GetUser() user: User,
  ) {
    IsAdmin(user);
    const hoursAhead = hoursAheadStr ? parseInt(hoursAheadStr, 10) : 24;
    const hours =
      Number.isFinite(hoursAhead) && hoursAhead > 0 ? hoursAhead : 24;
    const testMode = testModeStr === 'true' || testModeStr === '1';
    return this.usersService.sendSessionReminders(hours, testMode);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @GetUser() user: User,
    @Query('includeRatings') includeRatings?: string,
    @Query('includePaymentHistory') includePaymentHistory?: string,
  ) {
    // Public profile access for authenticated admin/host/member users.
    const isAdmin = user.role === Role.superAdmin;
    const isHost =
      user.grantRole === GrantRole.host ||
      user.role === Role.standardMember ||
      user.role === Role.premiumMember;
    const isMember =
      user.grantRole === GrantRole.member || user.role === Role.member;

    if (!isAdmin && !isHost && !isMember) {
      throw new ForbiddenException(
        'Only admin, host, or member can access this endpoint',
      );
    }

    const options = {
      includeRatings: includeRatings === 'true',
      includePaymentHistory: includePaymentHistory === 'true',
    };

    return this.usersService.findOne(id, options);
  }
}
