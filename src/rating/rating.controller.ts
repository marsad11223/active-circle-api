import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RatingService } from './rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { GetUser } from 'src/auth/GetUser.Decorator';

@Controller('ratings')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  createRating(
    @Body() createRatingDto: CreateRatingDto,
    @GetUser() user: any,
  ) {
    // Members can rate activities they have booked
    return this.ratingService.createRating(
      createRatingDto,
      user._id.toString(),
    );
  }

  @Get('activity/:activityId')
  getActivityRatings(@Param('activityId') activityId: string) {
    // Get all ratings for an activity (public endpoint)
    return this.ratingService.getActivityRatings(activityId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/my-ratings')
  getMemberRatings(@GetUser() user: any) {
    // Get all ratings given by the current member
    return this.ratingService.getMemberRatings(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('member/dashboard')
  getMemberReviewsDashboard(@GetUser() user: any) {
    // Get reviews dashboard data for member (rating history, activities to review, past reviews)
    return this.ratingService.getMemberReviewsDashboard(user._id.toString());
  }
}

