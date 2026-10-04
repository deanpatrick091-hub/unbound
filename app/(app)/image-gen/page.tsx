import {ImageStudio} from '@/components/images/image-studio';
import {imageProviders} from '@/lib/images/providers';
export default function ImageGenPage(){return <ImageStudio providers={imageProviders()}/>;}
