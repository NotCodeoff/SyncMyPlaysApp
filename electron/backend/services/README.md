# Advanced Matcher Service

## Quick Start

```javascript
const {
  findTrackWithVariants,
  processBatchWithReview,
  calculateMatchScore
} = require('./advancedMatcher');

// Single track matching with variants
const result = await findTrackWithVariants(
  {
    name: "Blinding Lights",
    artists: ["The Weeknd"],
    album: "After Hours",
    duration_ms: 200040,
    isrc: "USUG11903367"
  },
  appleHeaders,
  'us',
  makeAppleMusicApiRequest
);

console.log(result);
// {
//   sourceTrack: {...},
//   match: { id: '1234', attributes: {...}, matchScore: {...} },
//   alternatives: [...],
//   unavailable: false,
//   needsReview: false
// }

// Batch processing with progress tracking
const results = await processBatchWithReview(
  spotifyTracks,
  appleHeaders,
  'us',
  makeAppleMusicApiRequest,
  (progress) => {
    console.log(`${progress.current}/${progress.total}: ${progress.track}`);
  }
);

console.log(results);
// {
//   autoMatched: [...],   // Score >= 90
//   needsReview: [...],   // Score 40-89
//   unavailable: [...]    // No matches found
// }
```

## API Reference

### `findTrackWithVariants(sourceTrack, headers, storefront, apiRequestFunc)`

Finds the best match for a track along with alternative versions.

**Parameters:**
- `sourceTrack`: Object with `{name, artists[], album, duration_ms, isrc?}`
- `headers`: Apple Music API headers
- `storefront`: Apple Music storefront code (e.g., 'us', 'gb', 'jp')
- `apiRequestFunc`: Function to make API requests

**Returns:** Promise resolving to:
```javascript
{
  sourceTrack: Object,
  match: Object | null,          // Best match if score >= 75
  alternatives: Array,           // Other good matches
  unavailable: boolean,          // True if no matches found
  needsReview: boolean,          // True if confidence < high
  searchAttempts: Array          // Debug info
}
```

### `processBatchWithReview(tracks, headers, storefront, apiRequestFunc, progressCallback)`

Process multiple tracks with variant detection.

**Parameters:**
- `tracks`: Array of source tracks
- `headers`: Apple Music API headers
- `storefront`: Storefront code
- `apiRequestFunc`: API request function
- `progressCallback`: Optional function called with progress updates

**Returns:** Promise resolving to:
```javascript
{
  autoMatched: Array,      // High confidence matches
  needsReview: Array,      // Need user review
  unavailable: Array       // Not found on platform
}
```

### `calculateMatchScore(sourceTrack, candidate)`

Calculate comprehensive match score between source and candidate.

**Parameters:**
- `sourceTrack`: Original track object
- `candidate`: Candidate track from destination platform

**Returns:**
```javascript
{
  total: number,              // 0-100
  confidence: string,         // 'high' | 'medium' | 'low' | 'very_low'
  breakdown: {
    title: { similarity: number, score: number },
    artist: { similarity: number, score: number },
    album: { similarity: number, score: number },
    duration: { diff: number, score: number },
    variant: { match: boolean, bonus/penalty: number }
  }
}
```

### `getTrackVariantType(trackName, albumName)`

Detect what type of variant a track is.

**Parameters:**
- `trackName`: Track title
- `albumName`: Album name

**Returns:** Array of variant types:
- `'live'`
- `'remix'`
- `'acoustic'`
- `'instrumental'`
- `'radio_edit'`
- `'explicit'`
- `'remaster'`
- `'original'` (default)

## Utility Functions

### `normalizeString(value)`

Normalize a string for comparison:
- Converts to lowercase
- Removes accents/diacritics
- Removes punctuation
- Normalizes whitespace

```javascript
normalizeString("Beyoncé - Crazy In Love (feat. Jay-Z)")
// returns: "beyonce crazy in love feat jay z"
```

### `jaccardSimilarity(a, b)`

Calculate Jaccard similarity coefficient between two strings.

Returns value between 0 and 1 (0 = completely different, 1 = identical).

### `stringSimilarity(a, b)`

Calculate string similarity using Levenshtein distance.

Returns value between 0 and 1 (0 = completely different, 1 = identical).

## Integration Example

### With Express Route

```javascript
const express = require('express');
const { findTrackWithVariants } = require('../services/advancedMatcher');

const router = express.Router();

router.post('/match-track', async (req, res) => {
  const { track } = req.body;
  
  const headers = {
    'Authorization': `Bearer ${developerToken}`,
    'Music-User-Token': mediaUserToken
  };
  
  const result = await findTrackWithVariants(
    track,
    headers,
    'us',
    makeAppleMusicApiRequest
  );
  
  res.json(result);
});

module.exports = router;
```

### With WebSocket Progress

```javascript
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const { tracks } = JSON.parse(message);
    
    const results = await processBatchWithReview(
      tracks,
      headers,
      'us',
      makeApiRequest,
      (progress) => {
        ws.send(JSON.stringify({
          type: 'progress',
          ...progress
        }));
      }
    );
    
    ws.send(JSON.stringify({
      type: 'complete',
      results
    }));
  });
});
```

## Performance Tips

1. **Rate Limiting**: Add delays between API calls to avoid throttling
2. **Caching**: Cache ISRC lookups for frequently transferred tracks
3. **Parallel Processing**: Process independent tracks in parallel (with rate limit consideration)
4. **Session Storage**: Store results in Redis for large batch operations
5. **Progress Tracking**: Always provide progress callbacks for better UX

## Error Handling

The matcher handles errors gracefully:
- Failed ISRC lookup → Falls back to metadata search
- Failed metadata search → Falls back to flexible search
- All searches fail → Mark as unavailable
- Network errors → Logged, track marked for retry

Always wrap calls in try-catch for production use:

```javascript
try {
  const result = await findTrackWithVariants(...);
  // Handle result
} catch (error) {
  console.error('Matching error:', error);
  // Handle error appropriately
}
```

