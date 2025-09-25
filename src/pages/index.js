import { useState } from 'react';
import {
  Box,
  Container,
  VStack,
  Input,
  Button,
  Text,
  Progress,
  Alert,
  AlertIcon,
  useToast
} from '@chakra-ui/react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadPath, setDownloadPath] = useState(null);
  const [captureStrategy, setCaptureStrategy] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(null);
  const toast = useToast();

  const playbackRateDisplay = (() => {
    if (playbackRate === null || playbackRate === undefined) {
      return null;
    }
    const numericValue = Number(playbackRate);
    if (Number.isNaN(numericValue)) {
      return null;
    }
    return `${numericValue.toFixed(2)}x playback`;
  })();

  const steps = [
    'Preparing',
    'Launching Browser',
    'Setting up Page',
    'Accessing Meeting',
    'Setting up Recording',
    'Recording in Progress'
  ];

  const startRecording = async () => {
    if (!url) {
      toast({
        title: 'Error',
        description: 'Please enter a valid URL',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsRecording(true);
      setStatus('Initiating recording...');
      setProgress(0);
      setCurrentStep(0);
      setTotalSteps(0);
      setDownloadUrl(null);
      setDownloadPath(null);
      setCaptureStrategy(null);
      setPlaybackRate(null);

      const response = await fetch('/api/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to start recording');
      }

      const { recordingId } = await response.json();
      setStatus('Recording initiated. Setting up browser...');

      // Set up SSE for progress updates (scoped to this recording id)
      const eventSource = new EventSource(`/api/progress?recordingId=${recordingId}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.recordingId && recordingId && data.recordingId !== recordingId) {
          return;
        }

        if (data.type === 'progress') {
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
          if (data.step !== undefined) {
            setCurrentStep(data.step);
          }
          if (data.totalSteps !== undefined) {
            setTotalSteps(data.totalSteps);
          }
          if (data.message) {
            setStatus(data.message);
          }

          if (data.captureStrategy) {
            setCaptureStrategy(data.captureStrategy);
          }
          if (data.playbackRate) {
            setPlaybackRate(data.playbackRate);
          }

          if (data.currentTime && data.duration) {
            const videoProgress = Math.round((data.currentTime / data.duration) * 100);
            setStatus(`Recording in progress: ${videoProgress}% of video processed`);
          }
        }

        if (data.type === 'complete') {
          eventSource.close();
          setIsRecording(false);
          setProgress(100);
          setStatus(data.message || 'Recording completed successfully');
          if (data.downloadUrl) {
            setDownloadUrl(data.downloadUrl);
          }
          if (data.filePath) {
            setDownloadPath(data.filePath);
          }
          if (data.captureStrategy) {
            setCaptureStrategy(data.captureStrategy);
          }
          if (data.playbackRate) {
            setPlaybackRate(data.playbackRate);
          }
          toast({
            title: 'Success',
            description: data.message || 'Recording completed successfully',
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
        } else if (data.type === 'error') {
          eventSource.close();
          setIsRecording(false);
          setProgress(0);
          setStatus(data.message || 'Recording failed');
          if (data.captureStrategy) {
            setCaptureStrategy(data.captureStrategy);
          }
          toast({
            title: 'Error',
            description: data.message || 'Recording failed',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsRecording(false);
        setProgress(0);
        setStatus('Connection to server lost');
        toast({
          title: 'Error',
          description: 'Connection to server lost',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      };

    } catch (error) {
      setIsRecording(false);
      setStatus(error.message);
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Container maxW="container.md" py={10}>
      <VStack spacing={6}>
        <Text fontSize="2xl" fontWeight="bold">
          BigBlueButton Recording Tool
        </Text>
        
        <Box w="100%">
          <Input
            placeholder="Enter BigBlueButton recording URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            isDisabled={isRecording}
            mb={4}
          />
          
          <Button
            colorScheme="blue"
            onClick={startRecording}
            isLoading={isRecording}
            isDisabled={isRecording}
            w="100%"
          >
            Start Recording
          </Button>
        </Box>

        {isRecording && (
          <Box w="100%" p={4} borderRadius="md" borderWidth="1px">
            <VStack spacing={4} align="stretch">
              <Text fontWeight="bold">{status}</Text>

              {captureStrategy && (
                <Text fontSize="sm" color="gray.600">
                  Mode: {captureStrategy === 'displayMedia' ? 'Tab capture' : 'Direct stream'}
                  {playbackRateDisplay ? ` · ${playbackRateDisplay}` : ''}
                </Text>
              )}

              {/* Overall progress */}
              <Box>
                <Text mb={2} fontSize="sm" color="gray.600">
                  Overall Progress: {progress}%
                </Text>
                <Progress value={progress} size="lg" colorScheme="blue" />
              </Box>

              {/* Step progress */}
              <Box>
                <Text mb={2} fontSize="sm" color="gray.600">
                  Current Step: {currentStep} of {totalSteps}
                </Text>
                <Progress 
                  value={(currentStep / totalSteps) * 100} 
                  size="md" 
                  colorScheme="green"
                />
              </Box>

              {/* Steps list */}
              <Box>
                <Text mb={2} fontSize="sm" color="gray.600">Steps:</Text>
                {steps.map((step, index) => (
                  <Text 
                    key={index} 
                    fontSize="sm"
                    color={index === currentStep ? 'blue.500' : 
                           index < currentStep ? 'green.500' : 'gray.500'}
                  >
                    {index + 1}. {step} {index === currentStep ? '(Current)' : ''}
                  </Text>
                ))}
              </Box>
            </VStack>
          </Box>
        )}

        {status && !isRecording && (
          <Alert status="info">
            <AlertIcon />
            {status}
          </Alert>
        )}

        {downloadUrl && (
          <Box w="100%" p={4} borderRadius="md" borderWidth="1px">
            <VStack spacing={3} align="stretch">
              <Text fontWeight="semibold">Recording ready for download</Text>
              {captureStrategy && (
                <Text fontSize="sm" color="gray.600">
                  Mode: {captureStrategy === 'displayMedia' ? 'Tab capture' : 'Direct stream'}
                  {playbackRateDisplay ? ` · ${playbackRateDisplay}` : ''}
                </Text>
              )}
              <Button
                as="a"
                href={downloadUrl}
                colorScheme="green"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download MP4
              </Button>
              {downloadPath && (
                <Text fontSize="sm" color="gray.600">
                  Saved locally at: {downloadPath}
                </Text>
              )}
            </VStack>
          </Box>
        )}
      </VStack>
    </Container>
  );
}
