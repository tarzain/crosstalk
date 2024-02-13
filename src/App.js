import './App.css';
import config from './config.js';
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import OpenAI from "openai";
import { useState, useRef, useEffect } from "react";

const deepgram = createClient(config.deepgram.apiKey);
const openai = new OpenAI(config.openai);
openai.dangerouslyAllowBrowser = true;

const humanSpeaker = 1;
const aiSpeaker = 0;
// unset this if you don't have echo cancellation
// the browser seems to have built in echo cancellation
const flipSpeaker = true;
const startPhrase = "Hello, how can I help you?";

function App() {
  const [interimTranscript, setInterimTranscript] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [continuation, setContinuation] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [aiSpeakingState, setAiSpeaking] = useState(false);
  const aiSpeaking = useRef(false);
  const liveRef = useRef(null);
  const synth = useRef(window.speechSynthesis);
  const chatbox = useRef(null);

  const populateVoiceList = () => {
    if ('speechSynthesis' in window) {
      let speechVoices = synth.current.getVoices();
      setVoices(speechVoices);
      // find the google us voice if available
      let googleVoice = speechVoices.find(voice => voice.name === 'Google UK English Male');
      if (googleVoice) {
        setSelectedVoice(googleVoice.name);
        return;
      }
      setSelectedVoice(speechVoices[0]?.name);
    }
  }

  function estimateSpeechTime(text) {
    // >:( this is only necessary because none of the browsers actually report the charIndex on interruption as per the spec
    // Average speaking rate: 150 words per minute (2.5 words per second)
    let words = text.split(/\s+/).length;
    let characters = text.length;
    // Weight factor decreases as the word count increases
    let characterWeight = 1 / (1 + words / 10);
    let timeSeconds = (words / 2.5) + (characters * characterWeight / 15.0);
    return timeSeconds;
  }

  const addToTranscript = (text, elapsedTime) => {
    let candidate;
    // estimate the character index from the elapsed time
    if (elapsedTime) {
      if (elapsedTime > 1000) {
        // if the elapsed time is greater than 1000 then the estimate is in ms instead of seconds
        elapsedTime = elapsedTime / 1000;
      }
      let words = text.split(' ');
      let wordIndex = words.length;
      let estimatedDuration = estimateSpeechTime(text);
      wordIndex = (elapsedTime / estimatedDuration) * wordIndex;
      let subtext = words.slice(0, wordIndex).join(' ') + '—';
      candidate = textToTranscript(`Speaker${aiSpeaker}: ` + subtext, true);
    }
    else {
      candidate = textToTranscript(`Speaker${aiSpeaker}: ` + text, true);
    }
    setTranscript((prevTranscript) => {
      if (!prevTranscript) {
        return candidate;
      }
      let newPrevTranscript = JSON.parse(JSON.stringify(prevTranscript));
      newPrevTranscript.words.push(...candidate.words);
      return newPrevTranscript;
    });
  }

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const voices = synth.current.getVoices();
      const utterance = new SpeechSynthesisUtterance(text);
      const selectedVoiceObject = voices.find(voice => voice.name === selectedVoice);
      utterance.voice = selectedVoiceObject;
      utterance.onstart = () => {
        console.log("Starting utterance");
        aiSpeaking.current = true;
        setAiSpeaking(true);
      };
      utterance.onresume = () => {
        console.log("Resuming utterance");
        aiSpeaking.current = true;
      };
      utterance.onboundary = (event) => {
        console.log("Boundary in utterance", event);
      }
      utterance.onerror = (event) => {
        console.log("Error in utterance", event);
        aiSpeaking.current = false;
        setAiSpeaking(false);
        addToTranscript(event.utterance.text, event.elapsedTime);
      };
      utterance.onpause = () => {
        console.log("Pausing utterance");
        aiSpeaking.current = false;
      };
      utterance.onmark = (event) => {
        console.log("Mark in utterance", event);
      };
      utterance.onend = (event) => {
        console.log("ending utterance");
        aiSpeaking.current = false;
        setAiSpeaking(false);
        addToTranscript(event.utterance.text);
      };
      synth.current.speak(utterance);
    } else {
      console.log('Web Speech API is not supported in this browser.');
    }
  }

  const handleVoiceChange = (event) => {
    setSelectedVoice(event.target.value);
  };

  const generateResponse = async (prompt) => {
    const completion = await openai.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt: "Complete the dialog, sometimes the user isn't done speaking so please anticipate that. \n" + prompt,
      stop: [`\nSpeaker${humanSpeaker}:`, `\nSpeaker${humanSpeaker + 1}:`, `\nSpeaker:${humanSpeaker + 2}`, `Speaker:${humanSpeaker}`],
      max_tokens: 100,
    });
    if (completion.choices[0].text.substring(0, 11) === `\nSpeaker${aiSpeaker}:`) {
      // strip the newline from the speaker tag
      completion.choices[0].text = completion.choices[0].text.substring(1);
    }
    return completion.choices[0].text;
  }

  useEffect(() => {
    if (transcript) {
      generateResponse(renderTranscript(transcript)).then((response) => setContinuation(textToTranscript(response)));
    }
    if (chatbox.current) chatbox.current.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    // in Google Chrome the voices are not ready on page load
    if ("onvoiceschanged" in synth.current) {
      synth.current.onvoiceschanged = populateVoiceList;
    } else {
      populateVoiceList();
    }
  }, []);

  const activateMicrophone = () => {
    //Add microphone access
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (!MediaRecorder.isTypeSupported('audio/webm'))
        return alert('Browser not supported')

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      //create a websocket connection
      // diarization doesn't seem to work properly with interim results
      // for best results, disable interim results
      // for best UX, enable interim results which show up nicely in the UI and make it feel snappier
      const live = deepgram.listen.live({
        model: "nova-2-general", diarize: true,
        punctuate: true, smart_format: true,
        filler_words: true,
        endpointing: true, multichannel: false,
        alternatives: 1, interim_results: true,
      });

      live.on(LiveTranscriptionEvents.Open, () => {
        mediaRecorder.start(1000);

        setContinuation(textToTranscript(`Speaker${aiSpeaker}: ${startPhrase}`, true));
        speak(startPhrase);

        live.on(LiveTranscriptionEvents.Transcript, (data) => {
          let candidate = data.channel.alternatives[0];
          if (candidate.words.length > 0) {
            // flip the speaker if necessary
            if (flipSpeaker) {
              candidate.words.forEach((word) => {
                if (word.speaker === aiSpeaker) {
                  word.speaker = humanSpeaker;
                }
                else if (word.speaker === humanSpeaker) {
                  word.speaker = aiSpeaker;
                }
              });
            }
            setInterimTranscript(candidate);
            if (aiSpeaking.current) {
              synth.current.cancel();
              aiSpeaking.current = false;
            }
            if (data.is_final && candidate.words.length > 0) {
              setInterimTranscript(null);
              setTranscript((prevTranscript) => {
                if (!prevTranscript) {
                  return candidate;
                }
                let newPrevTranscript = JSON.parse(JSON.stringify(prevTranscript));
                newPrevTranscript.words.push(...candidate.words);
                return newPrevTranscript;
              });
            }
          }
        });
        live.on(LiveTranscriptionEvents.Error, (error) => {
          console.log(error);
        });
        live.on(LiveTranscriptionEvents.Close, () => {
          console.log('close');
          live.finish();
        });
      });

      liveRef.current = live;

      mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0 && live.getReadyState()) {
          liveRef.current.send(event.data);
        }
      });
    })
  }

  const renderTranscript = (transcript) => {
    let previousSpeaker = null;
    let transcriptText = '';
    if (!transcript || transcript.words.length === 0) {
      return '';
    }
    transcript.words.forEach((word, index) => {
      if (previousSpeaker !== word.speaker) {
        transcriptText += '\nSpeaker' + word.speaker + ': ';
        previousSpeaker = word.speaker;
      }
      transcriptText += word.punctuated_word + ' ';
    });
    return transcriptText;
  }

  const textToTranscript = (textTranscript, notSpeaking) => {
    // transform the plaintext rendered transcript back into a transcript object
    // this is useful for receiving the transcript from the OpenAI API
    let newTranscript = {
      words: [],
    };
    let currentSpeaker = aiSpeaker;
    if (transcript && transcript.words && transcript.words.length > 0) {
      currentSpeaker = transcript.words[transcript.words.length - 1].speaker;
    }
    // modifying this so that it only speaks if the first word indicates it's the AI speaker
    textTranscript = textTranscript.trim();
    if (textTranscript.startsWith(`Speaker${aiSpeaker}:`) && !notSpeaking) {
      if (aiSpeaking.current) {
        synth.current.cancel();
        aiSpeaking.current = false;
      }
      speak(textTranscript.split(' ').slice(1).join(' '));
    }
    textTranscript.split(' ').forEach((word, index) => {
      if (word === '') {
        return;
      }
      if (word.trim().startsWith('Speaker')) {
        currentSpeaker = parseInt(word.trim()[7]);
        return;
      }
      newTranscript.words.push({
        punctuated_word: word,
        speaker: currentSpeaker,
      });
    });
    return newTranscript;
  }

  const humanRenderTranscript = (transcript) => {
    let previousSpeaker = null;
    if (!transcript || transcript.words.length === 0) {
      return <p></p>;
    }
    let transcriptSegmentations = [];
    for (let i = 0; i < transcript.words.length; i++) {
      let word = transcript.words[i];
      if (previousSpeaker !== word.speaker) {
        transcriptSegmentations.push(word.punctuated_word);
        previousSpeaker = word.speaker;
      }
      else {
        transcriptSegmentations[transcriptSegmentations.length - 1] += ' ' + word.punctuated_word;
      }
    }
    return transcriptSegmentations.map((segmentation, index) => {
      let isBot = false;
      if (transcript.words[0].speaker == 0) isBot = index % 2 === 0;
      else isBot = index % 2 === 1;
      let speaker = isBot ? 'Bot' : 'Me';
      let speakerClass = isBot ? 'chat chat-start' : 'chat chat-end';
      let bubbleClass = isBot ? 'chat-bubble chat-bubble-info' : 'chat-bubble';
      return (
        <div className={speakerClass} key={index}>
          <div className="chat-header mx-1">
            {speaker}
          </div>
          <div className={bubbleClass}>{segmentation.replace(`Speaker${aiSpeaker}:`, 'Bot:')}</div>
        </div>
      );
    });
  }

  return (
    <div className="App">
      <div className='md:container md:mx-auto'>
        <h1 className="text-5xl font-bold py-4">crosstalk</h1>
        <div className='content pb-4'>
          <div className='join'>
            <button
              type='button'
              className='btn btn-neutral disabled:pointer-events-none join-item'>
              voice
            </button>
            <select value={selectedVoice} onChange={handleVoiceChange} className='select select-bordered w-full max-w-xs join-item'>
              {voices.map((voice, index) => (
                <option key={index} value={voice.name}>
                  {`${voice.name} (${voice.lang})`}
                </option>
              ))}
            </select>
            <button
              onClick={activateMicrophone}
              type='button'
              className='btn btn-neutral join-item'>
              start
            </button>
          </div>
        </div>
        <div className='text-input'>
          {humanRenderTranscript(transcript)}
        </div>
        <div className="text-input opacity-25 animate-pulse" ref={chatbox}>
          {continuation ? aiSpeakingState ? "speaking:" : "predicting:" : ''}{humanRenderTranscript(continuation)}
        </div>
        <div className='text-input'>
          {humanRenderTranscript(interimTranscript)}
        </div>
      </div>
    </div>
  )
}

export default App;
