// nest imports
import { BadRequestException, Injectable } from '@nestjs/common';

// third-party imports
import { v2 as cloudinary } from 'cloudinary';
import { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';

const streamifier = require('streamifier');

@Injectable()
export class CloudinaryService {
  uploadImage(
    file: Express.Multer.File,
  ): Promise<UploadApiErrorResponse | UploadApiResponse> {
    try {
      if (!file) throw new BadRequestException('Invalide File');
      const allowedExtensions = [
        '.webp',
        '.png',
        '.jpg',
        '.gif',
        '.jpeg',
        '.pdf',
        '.xls',
        '.xlsx',
        '.svg',
      ];
      const fileExtensionParts = file.originalname.split('.');
      const extension = fileExtensionParts.pop();
      if (!extension) {
        throw new BadRequestException('File must have an extension');
      }
      const fileExtension = '.' + extension.toLowerCase();

      if (!allowedExtensions.includes(fileExtension)) {
        throw new BadRequestException('Only images are allowed');
      }
      return new Promise<UploadApiErrorResponse | UploadApiResponse>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'activecircle' },
            (error, result) => {
              if (error) return reject(error);
              if (!result) {
                return reject(new Error('Upload failed: No result returned'));
              }
              resolve(result);
            },
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        },
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
