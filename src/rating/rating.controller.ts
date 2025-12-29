import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RatingService } from './rating.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ReplyToReviewDto } from './dto/reply-to-review.dto';
import { HostReviewsDto } from './dto/host-reviews.dto';
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

  @UseGuards(AuthGuard('jwt'))
  @Get('host/dashboard')
  getHostReviewsDashboard(@GetUser() user: any) {
    // Get host reviews dashboard with summary stats (average rating, total reviews, distribution, response rate)
    return this.ratingService.getHostReviewsDashboard(user._id.toString());
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('host/reviews')
  getHostReviews(
    @Query() filters: HostReviewsDto,
    @GetUser() user: any,
  ) {
    // Get host reviews (optionally filtered by activityId)
    // If activityId provided: returns reviews for that activity only
    // If no activityId: returns reviews for all host's activities
    return this.ratingService.getHostReviews(
      user._id.toString(),
      filters.activityId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('host/reply')
  replyToReview(
    @Body() replyDto: ReplyToReviewDto,
    @GetUser() user: any,
  ) {
    // Host can reply to a member's review (one-time reply, member cannot reply back)
    return this.ratingService.replyToReview(replyDto, user._id.toString());
  }
}

