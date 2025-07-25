# Vercel Deployment Guide

This project is optimized for deployment on Vercel.

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/deepratna-awale/sd-parsers)

## Manual Deployment

1. **Connect to Vercel**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Deploy**
   ```bash
   vercel --prod
   ```

## Configuration

The project includes:
- ✅ `vercel.json` - Vercel configuration
- ✅ `.vercelignore` - Files to exclude from deployment
- ✅ Build scripts optimized for Vercel
- ✅ Node.js version specified in package.json

## Environment Variables

No environment variables are required for basic operation. The API will automatically:
- Detect the production environment
- Serve static files from `/public`
- Handle CORS appropriately
- Set appropriate timeouts

## Endpoints

- `/` - Demo web interface
- `/health` - API health check
- `/parse` - Parse uploaded image files
- `/parse/url` - Parse images from URLs

## Notes

- Maximum file size: 50MB
- Supported formats: JPEG, PNG
- Function timeout: 30 seconds
- Auto-scaling enabled
