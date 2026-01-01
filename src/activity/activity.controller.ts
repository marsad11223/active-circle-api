import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { BrowseActivitiesDto } from './dto/browse-activities.dto';
import { ReoccurActivityDto } from './dto/reoccur-activity.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { OptionalJwtAuthGuard } from 'src/auth/optional-jwt.guard';

@Controller('activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() createActivityDto: CreateActivityDto, @GetUser() user: any) {
    // Only hosts can create activities
    return this.activityService.create(createActivityDto, user._id.toString());
  }

  @Get()
  findAll() {
    // Public endpoint - anyone can view activities
    return this.activityService.findAll();
  }

  @Get('browse')
  browseActivities(@Query() filters: BrowseActivitiesDto) {
    // Browse activities with filters (public endpoint)
    // Members can optionally authenticate to use their radius preference
    return this.activityService.browseActivities(filters);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('browse/member')
  browseActivitiesForMember(
    @Query() filters: BrowseActivitiesDto,
    @GetUser() user: any,
  ) {
    // Browse activities with filters for authenticated members
    // Uses member's radius preference if maxDistance not provided
    const memberId = user._id.toString();
    return this.activityService.browseActivities(filters, memberId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/:id')
  findOneForMember(@Param('id') id: string, @GetUser() user: any) {
    // Authenticated endpoint for members - includes booking status
    return this.activityService.findOne(id, user._id.toString());
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user?: any) {
    // Public endpoint - anyone can view a specific activity
    // If user is authenticated, includes booking status
    const memberId = user?._id?.toString();
    return this.activityService.findOne(id, memberId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/my-activities')
  findByHost(@GetUser() user: any) {
    // Get all activities created by the current host
    return this.activityService.findByHost(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/upcoming')
  getUpcomingActivities(@GetUser() user: any) {
    // Get upcoming activities for the current host (date >= today, status = ACTIVE)
    return this.activityService.getUpcomingActivities(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/past')
  getPastActivities(@GetUser() user: any) {
    // Get past/completed activities for the current host with summary statistics
    return this.activityService.getPastActivities(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/cancel')
  cancelActivity(
    @Param('id') id: string,
    @Body() body: { cancelReason?: string },
    @GetUser() user: any,
  ) {
    // Cancel an activity (host only)
    // For paid activities: processes partial refund (fee - stripe fee)
    // For free activities: skips refund process
    return this.activityService.cancelActivity(
      id,
      user._id.toString(),
      body.cancelReason,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @GetUser() user: any,
  ) {
    // Only the host who created the activity or superAdmin can update
    return this.activityService.update(
      id,
      updateActivityDto,
      user._id.toString(),
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string, @GetUser() user: any) {
    // Only the host who created the activity or superAdmin can delete
    return this.activityService.remove(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/complete')
  markAsCompleted(@Param('id') id: string, @GetUser() user: any) {
    // Mark activity as completed (held)
    return this.activityService.markAsCompleted(id, user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/reoccur')
  reoccurActivity(
    @Param('id') id: string,
    @Body() reoccurActivityDto: ReoccurActivityDto,
    @GetUser() user: any,
  ) {
    // Re-occur an activity with new date and time
    // Previous bookings remain with the original activity
    const newDate = new Date(reoccurActivityDto.date);
    return this.activityService.reoccurActivity(
      id,
      newDate,
      reoccurActivityDto.time,
      user._id.toString(),
    );
  }
}
