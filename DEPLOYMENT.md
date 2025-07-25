# Deployment Guide

## Vercel Deployment

### Prerequisites
- A GitHub account
- A Vercel account (free tier available)
- Your code pushed to a GitHub repository

### Steps

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add API endpoints for Vercel deployment"
   git push origin server
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with your GitHub account
   - Click "New Project"
   - Import your `sd-parsers` repository

3. **Configure the deployment**
   - Vercel will automatically detect the Node.js project
   - The `vercel.json` configuration is already set up
   - No additional configuration needed

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your API
   - You'll get a live URL like `https://sd-parsers-xxx.vercel.app`

### Environment Variables (Optional)

You can set environment variables in Vercel's dashboard:
- `NODE_ENV=production` (automatically set by Vercel)
- Custom API keys or configuration if needed

### Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions

## Alternative Deployment Options

### Railway
1. Connect your GitHub repository to Railway
2. Railway will auto-detect and deploy the Node.js app
3. No additional configuration needed

### Render
1. Connect your GitHub repository to Render
2. Choose "Web Service"
3. Set build command: `npm run build`
4. Set start command: `npm start`

### Heroku
1. Create a new Heroku app
2. Connect your GitHub repository
3. Enable automatic deploys from the `server` branch
4. Add a `Procfile` with: `web: npm start`

### Docker Deployment

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t sd-parsers-api .
docker run -p 3000:3000 sd-parsers-api
```

## Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start

# For development with auto-reload
npm run dev  # (in another terminal)
node dist/server.js
```

## Testing the Deployment

After deployment, test your endpoints:

```bash
# Health check
curl https://your-app.vercel.app/health

# API documentation
curl https://your-app.vercel.app/

# Test with a sample image (replace with your actual URL)
curl -X POST \
  -F "image=@sample.png" \
  https://your-app.vercel.app/parse
```

## Performance Considerations

### Memory Limits
- Vercel Hobby plan: 1024MB memory limit
- Image processing can be memory-intensive
- Consider implementing file size limits (already set to 50MB)

### Timeout Limits
- Vercel Hobby plan: 10 second timeout
- Vercel Pro plan: 30 second timeout (configured in vercel.json)
- Large images or eager parsing might hit timeout limits

### Cold Starts
- Serverless functions have cold start delays
- First request after inactivity may be slower
- Consider using a keep-alive service for production

## Monitoring

### Vercel Analytics
- Built-in analytics available in Vercel dashboard
- Monitor request volume, response times, errors

### Error Tracking
Consider adding error tracking services like:
- Sentry
- Bugsnag
- LogRocket

### Health Monitoring
Set up monitoring for the `/health` endpoint:
- UptimeRobot
- Pingdom
- StatusCake

## Security Considerations

### Rate Limiting
Consider adding rate limiting for production:
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
```

### File Upload Security
- File type validation is already implemented
- File size limits are set (50MB)
- Consider adding virus scanning for production

### CORS Configuration
Current CORS configuration allows all origins. For production, consider restricting:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com', 'https://www.yourdomain.com']
}));
```

## Troubleshooting

### Common Issues

1. **Build failures**
   - Check TypeScript compilation errors
   - Ensure all dependencies are installed
   - Verify `tsconfig.json` configuration

2. **Runtime errors**
   - Check server logs in Vercel dashboard
   - Verify environment variables
   - Test locally first

3. **Timeout errors**
   - Reduce file size limits
   - Use faster eagerness level
   - Consider upgrading Vercel plan

4. **Memory errors**
   - Optimize image processing
   - Implement streaming for large files
   - Consider upgrading Vercel plan

### Getting Help

- Check Vercel documentation: https://vercel.com/docs
- Review server logs in deployment dashboard
- Test endpoints locally first
- Check GitHub Issues for similar problems
