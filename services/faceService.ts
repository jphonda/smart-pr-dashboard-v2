// Declare global faceapi from CDN
declare const faceapi: any;

// Use hosted models from the repo
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export const loadFaceModels = async () => {
  try {
    console.log("Loading FaceAPI models...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("Face API Models Loaded Successfully");
    return true;
  } catch (error) {
    console.error("Failed to load face models", error);
    return false;
  }
};

export const detectFace = async (videoElement: HTMLVideoElement) => {
  if (!videoElement || videoElement.paused || videoElement.ended) return null;
  
  try {
    // Use TinyFaceDetectorOptions for speed and reliability
    // inputSize: 512 is a good balance for speed/accuracy
    // scoreThreshold: 0.5 filters out bad detections
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 });

    const detection = await faceapi
      .detectSingleFace(videoElement, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
      
    return detection;
  } catch (err) {
    console.error("Face detection error:", err);
    return null;
  }
};

// Calculate Euclidean distance between two descriptors manually
// This avoids dependency on faceapi.FaceMatcher which might cause constructor errors
function getEuclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
    if (a.length !== b.length) return 1.0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

export const matchFace = (
  descriptor: Float32Array, 
  users: any[], 
  threshold: number = 0.6 
) => {
  if (!users || users.length === 0) return null;

  try {
    let bestMatchUser = null;
    let minDistance = Number.MAX_VALUE;

    for (const user of users) {
        let userDescriptor: Float32Array;
        
        // Ensure userDescriptor is a Float32Array
        if (user.faceDescriptor instanceof Float32Array) {
            userDescriptor = user.faceDescriptor;
        } else if (Array.isArray(user.faceDescriptor)) {
            userDescriptor = new Float32Array(user.faceDescriptor);
        } else {
            // Fallback for object-like storage (e.g. from JSON)
            userDescriptor = new Float32Array(Object.values(user.faceDescriptor));
        }

        // Calculate distance
        const distance = getEuclideanDistance(descriptor, userDescriptor);
        
        console.log(`Distance to ${user.name}: ${distance.toFixed(4)}`);

        // Find the closest match
        if (distance < minDistance) {
            minDistance = distance;
            bestMatchUser = user;
        }
    }

    // Check if the best match is within the threshold
    if (minDistance < threshold) {
        return bestMatchUser;
    }
  } catch (err) {
    console.error("Face matching error:", err);
  }

  return null;
};
