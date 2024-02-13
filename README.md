# Crosstalk
_a system for 2-way interruptible voice interactions between human and LLM_

This is an open source example implementation of the Crosstalk method for voice interaction between human and AI. The main problem this method aims to address is the lack of 2-way interruptions in traditional implementations of turn-based AI voice assistants. Normally, a turn based AI voice assistant system uses a combination of speech recognition, speech synthesis, and LLM text completion in distinct stages to engage in a dialog with the user. While the AI speaks, the user's speech is not being recognized. Once the AI is done speaking, the user's speech is recognized, then the text response is generated, and the AI responds. This is a problem because it is not how humans interact with each other. Humans interrupt each other all the time. In the absence of natural interruptions, both parties are unable to adequately model each other socially and spend a lot of time waiting for the other to finish speaking.

The Crosstalk method is a simple way to implement 2-way interruptions in a turn-based AI voice assistant system. The method uses a single stream of speech recognition, speech synthesis, and LLM text completion. The AI and the user's speech are recognized simultaneously. We use diarization to separate the user's speech from the AI's speech. When the AI is speaking, its words are added to the dialog until the user interrupts. Once the user interrupts, the diarization will recognize a change of speaker, the AI will stop speaking, and the text completion will continue to run on the dialog until it is predicted that there is a change of speaker. If the change of speaker is predicted to be the AI, the AI will continue speaking. If the change of speaker is predicted to be the user, the AI will stop speaking and the user's speech will be added to the dialog. This process repeats until the user ends the conversation.

# Setup
1. Clone the repository
2. Install the dependencies
```bash
npm install
```
3. Create a config.js file in the src directory with the following content:
```javascript
const config = {
  "deepgram": {
    "apiKey": "",
    "apiUrl": "",
  },
  "openai": {
    "apiKey": "",
    "dangerouslyAllowBrowser": true,
    "baseUrl": "http://localhost:1234/v1" // or "https://api.openai.com/v1"
  }
}

export default config;
```
4. Start the development server
```bash
npm start
```
5. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## Todos:
- [x] Speech recognition
- [x] Speaker diarization
- [x] Browser Speech synthesis
- [x] LLM Text completion
- [x] Automatically start speaking when change of speaker is predicted to be the AI
- [x] Automatically stop speaking when user speaks over the AI
- [x] Add AI completion to the dialog if it is actually spoken
- [x] Add back interim transcripts to improve streaming capability, it looks like echo cancellation is already active for the browser speech recognition
- [x] Add AI completion to the dialog as it is generated, so that the user's interruption includes what the AI said
  - [ ] Right now I'm only adding AI completions to the dialog when they are done speaking. Because the user's speech is interrupting that, it ends up coming before the AI completion. Ideally I add the AI's speech as it is spoken.
- [x] Additionally, the interruptions is not currently tracking what is being said at the time of the interruption. Both charIndex from the error event and the onBoundary event are not actually being fired properly. What gives??
- [x] Publish simple demo
  - [x] Functionality
    - [x] 2 way interruptions
      - [x] User interrupts AI
        - [x] AI is speaking for a while, user can speak over it
        - [x] the AI will stop speaking
        - [x] the AI text will show as truncated
      - [x] AI interrupts user
        - [x] User is speaking for a while, before the user is done prediction shows the user continues to speak
        - [x] when the user is about to finish, the prediction shows change of speaker
        - [x] the AI will start speaking
        - [x] the user text will show as truncated
  - [x] Aesthetics
    - [x] transcript shows speakers and indicates what is being spoken
    - [x] UI has a voice button so it's clear that it's an audio interface
    - [x] completion is shown with low opacity
    - [x] scroll to bottom of transcript as new text is added
    - [ ] stretch: highlight words as they are spoken
  - [x] Render transcript + diarization in a clear, pleasant way

Sources:
* https://codersblock.com/blog/javascript-text-to-speech-and-its-many-quirks/
* https://www.smashingmagazine.com/2017/02/experimenting-with-speechsynthesis/


# ReactJS documentation

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

