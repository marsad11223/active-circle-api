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
import { AuthGuard } from '@nestjs/passport';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';
import { User } from 'src/schemas/user.schema';

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    // Public endpoint - anyone can view a specific activity
    return this.activityService.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/my-activities')
  findByHost(@GetUser() user: any) {
    // Get all activities created by the current host
    return this.activityService.findByHost(user._id.toString());
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
}
