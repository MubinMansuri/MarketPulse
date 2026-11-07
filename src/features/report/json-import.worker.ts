import { parseReportJsonText } from "./model";

self.onmessage = ({ data }: MessageEvent<{ id: number; text: string }>) => {
  self.postMessage({ id: data.id, result: parseReportJsonText(data.text) });
};
